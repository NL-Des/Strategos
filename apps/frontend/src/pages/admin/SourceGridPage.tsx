import {
  type CellEditInput,
  type CellPosition,
  type FormulaFunction,
  type GridCell,
  cellRef,
  columnLetters,
  expectsOperand,
  formulaFromFr,
  formulaToFr,
  parseCellRef,
  parseFormula,
} from '@strategos/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { editSourceCell, getSourceGrid, listSources } from '../../api/sources';
import { ErrorMessage } from '../../components/ErrorMessage';
import { RecalcMark } from '../../render/DataBlocks';
import { FormulaPanel } from './formula/FormulaPanel';
import type { TreeContext } from './formula/FormulaTree';
import { areaText, coloredRefs, resolveSheet, sheetPrefix } from './formula/refs';

const ROWS = 50;
const COLS = 26;

/** Première ligne ou colonne de la fenêtre qui contient `n`. */
const windowStart = (n: number, size: number) => Math.floor((n - 1) / size) * size + 1;

/** Contenu d'une cellule tel qu'on le saisit : la formule (en français), sinon la valeur. */
const inputOf = (cell: GridCell | undefined) =>
  cell ? (cell.formula ? `=${formulaToFr(cell.formula)}` : cell.display) : '';

/** Saisie envoyée : une formule repasse dans la syntaxe du fichier (`SUM(A1,1.5)`). */
const storedInput = (draft: string) =>
  draft.startsWith('=') && draft.length > 1 ? `=${formulaFromFr(draft.slice(1))}` : draft;

/** Cellule en cours d'édition : elle reste la même quand l'admin change de feuille pour citer une référence. */
interface Editing {
  sheet: string;
  position: CellPosition;
}

/** Référence insérée par un clic : un nouveau clic la remplace, Maj+clic l'étend en plage. */
interface Inserted {
  start: number;
  end: number;
  anchor: CellPosition;
  sheet: string;
}

/**
 * Admin › Sources › cellules (04) : la copie de référence d'un Excel uploadé,
 * vue et modifiée comme un tableur, par fenêtres de 50 lignes × 26 colonnes.
 * Les formules se lisent et s'écrivent en français ; une formule saisie n'est
 * pas calculée : elle le sera à l'ouverture dans Excel. À droite, l'assistant
 * de formules décompose la formule et aide à l'écrire.
 */
export function SourceGridPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const [sheet, setSheet] = useState<string | undefined>();
  const [top, setTop] = useState(1);
  const [left, setLeft] = useState(1);
  const [goTo, setGoTo] = useState('');
  const [goToError, setGoToError] = useState(false);

  const [editing, setEditing] = useState<Editing | null>(null);
  // Dernier contenu connu de la cellule éditée, gardé quand une autre feuille est affichée.
  const [current, setCurrent] = useState<GridCell | undefined>();
  const [draft, setDraft] = useState('');
  const [base, setBase] = useState('');
  const [cursor, setCursor] = useState(0);
  // Saisie en cours dans la barre de formule : un clic sur la grille peut y insérer une référence.
  const [formulaEdit, setFormulaEdit] = useState(false);
  const [inserted, setInserted] = useState<Inserted | null>(null);
  const [hoveredRef, setHoveredRef] = useState<number | null>(null);
  const editor = useRef<HTMLInputElement>(null);
  const pendingCursor = useRef<number | null>(null);
  const dragging = useRef(false);

  const sources = useQuery({ queryKey: ['admin', 'sources'], queryFn: listSources });
  const grid = useQuery({
    queryKey: ['admin', 'sources', id, 'cells', sheet, top, left],
    queryFn: () => getSourceGrid(id, { sheet, top, left, rows: ROWS, cols: COLS }),
    placeholderData: keepPreviousData,
  });
  const name = sources.data?.find((s) => s.id === id)?.name;
  const data = grid.data;

  const cells = new Map<string, GridCell>();
  for (const c of data?.cells ?? []) cells.set(`${c.row}:${c.col}`, c);
  const inWindow = (row: number, col: number) =>
    !!data &&
    row >= data.top &&
    row < data.top + data.rows &&
    col >= data.left &&
    col < data.left + data.cols;

  // Fenêtre rechargée (enregistrement, validation) : la cellule éditée repart de son contenu.
  const [seen, setSeen] = useState(data);
  if (seen !== data) {
    setSeen(data);
    if (
      editing &&
      data?.sheet === editing.sheet &&
      inWindow(editing.position.row, editing.position.col)
    ) {
      setCurrent(cells.get(`${editing.position.row}:${editing.position.col}`));
    }
  }
  const initial = inputOf(current);
  const baseKey = editing ? `${editing.sheet}|${cellRef(editing.position)}|${initial}` : '';
  if (base !== baseKey) {
    setBase(baseKey);
    setDraft(initial);
    setInserted(null);
  }

  const isFormula = draft.startsWith('=');
  const parsed = isFormula ? parseFormula(draft.slice(1), 'fr') : null;
  const refs = parsed ? coloredRefs(parsed.tokens) : [];
  const refMode =
    !!editing &&
    !!parsed &&
    formulaEdit &&
    cursor >= 1 &&
    (expectsOperand(parsed.tokens, cursor - 1) || inserted?.end === cursor);

  // Références de la formule présentes sur la feuille affichée, pour les surligner.
  const shownRefs =
    editing && data
      ? refs.filter(
          (r) =>
            r.token.ref.rect &&
            resolveSheet(r.token.ref, editing.sheet, data.sheets) === data.sheet,
        )
      : [];
  const refAt = (row: number, col: number) =>
    shownRefs.find(({ token: { ref } }) => {
      const r = ref.rect!;
      return row >= r.top && row <= r.bottom && col >= r.left && col <= r.right;
    });

  useLayoutEffect(() => {
    const at = pendingCursor.current;
    if (at === null || !editor.current) return;
    pendingCursor.current = null;
    editor.current.focus();
    editor.current.setSelectionRange(at, at);
  });

  useEffect(() => {
    const stop = () => (dragging.current = false);
    window.addEventListener('mouseup', stop);
    return () => window.removeEventListener('mouseup', stop);
  }, []);

  const moveCursor = (at: number) => {
    setCursor(at);
    pendingCursor.current = at;
  };

  const select = (position: CellPosition) => {
    if (!data) return;
    setEditing({ sheet: data.sheet, position });
    setCurrent(cells.get(`${position.row}:${position.col}`));
    setFormulaEdit(false);
  };

  /** Insère au curseur la référence de la cellule cliquée (ou étend la dernière en plage). */
  const insertRef = (position: CellPosition, extend: boolean) => {
    if (!data || !editing) return;
    const prefix = data.sheet === editing.sheet ? '' : sheetPrefix(data.sheet);
    let start = cursor;
    let end = cursor;
    let anchor = position;
    if (inserted && (inserted.end === cursor || extend)) {
      ({ start, end } = inserted);
      if (extend && inserted.sheet === data.sheet) anchor = inserted.anchor;
    } else if (document.activeElement === editor.current && editor.current) {
      start = editor.current.selectionStart ?? cursor;
      end = editor.current.selectionEnd ?? cursor;
    }
    const text = prefix + areaText(anchor, position);
    setDraft(draft.slice(0, start) + text + draft.slice(end));
    setInserted({ start, end: start + text.length, anchor, sheet: data.sheet });
    moveCursor(start + text.length);
  };

  const insertFunction = (fn: FormulaFunction) => {
    if (!editing) return;
    const call = `${fn.fr}(`;
    if (!isFormula) {
      setDraft(`=${call})`);
      moveCursor(call.length + 1);
    } else {
      const at = cursor >= 1 ? cursor : draft.length;
      setDraft(`${draft.slice(0, at)}${call})${draft.slice(at)}`);
      moveCursor(at + call.length);
    }
    setInserted(null);
    setFormulaEdit(true);
  };

  const save = useMutation({
    mutationFn: (body: CellEditInput) => editSourceCell(id, body),
    onSuccess: (cell) => {
      setCurrent(cell);
      setFormulaEdit(false);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'sources', id, 'cells'] }),
  });

  const openSheet = (next: string) => {
    setSheet(next);
    setTop(1);
    setLeft(1);
    // Formule en cours : on change de feuille pour y citer une référence.
    if (!(isFormula && formulaEdit)) setEditing(null);
  };

  const submitGoTo = (e: FormEvent) => {
    e.preventDefault();
    const position = parseCellRef(goTo);
    setGoToError(!position);
    if (!position || !data) return;
    setTop(windowStart(position.row, ROWS));
    setLeft(windowStart(position.col, COLS));
    setEditing({ sheet: data.sheet, position });
    setCurrent(cells.get(`${position.row}:${position.col}`));
    setFormulaEdit(false);
  };

  const ctx: TreeContext = {
    sourceId: id,
    formula: draft.slice(1),
    ownSheet: editing?.sheet ?? data?.sheet ?? '',
    sheets: data?.sheets ?? [],
    lookup: (s, row, col) =>
      s === data?.sheet && inWindow(row, col) ? (cells.get(`${row}:${col}`) ?? null) : undefined,
    colorAt: (start) => refs.find((r) => r.token.start === start)?.color,
    onHoverRef: setHoveredRef,
  };

  const rows = Array.from({ length: ROWS }, (_, i) => top + i);
  const cols = Array.from({ length: COLS }, (_, i) => left + i);

  return (
    <section className="source-grid-page">
      <p>
        <Link to="/admin/sources">{t('sources.grid.back')}</Link>
      </p>
      <h1>{name ?? t('sources.grid.title')}</h1>
      <p className="muted">{t('sources.grid.intro')}</p>
      <p className="muted">{t('sources.grid.editHelp')}</p>
      <ErrorMessage error={grid.error} />

      {data && (
        <>
          <div className="actions" role="group" aria-label={t('sources.grid.sheets')}>
            {data.sheets.map((s) => (
              <button
                key={s}
                type="button"
                className={s === data.sheet ? 'button' : 'button secondary'}
                aria-pressed={s === data.sheet}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => openSheet(s)}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="grid-toolbar">
            <form className="grid-goto" onSubmit={submitGoTo}>
              <label>
                {t('sources.grid.goTo')}
                <input
                  value={goTo}
                  size={8}
                  placeholder="B12"
                  aria-invalid={goToError}
                  onChange={(e) => setGoTo(e.target.value)}
                />
              </label>
              <button type="submit" className="button secondary">
                {t('sources.grid.goToSubmit')}
              </button>
            </form>
            <div className="actions">
              <button
                type="button"
                className="button secondary"
                disabled={top === 1}
                onClick={() => setTop(Math.max(1, top - ROWS))}
              >
                {t('sources.grid.rowsUp')}
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={top + ROWS > data.maxRow}
                onClick={() => setTop(top + ROWS)}
              >
                {t('sources.grid.rowsDown')}
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={left === 1}
                onClick={() => setLeft(Math.max(1, left - COLS))}
              >
                {t('sources.grid.colsLeft')}
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={left + COLS > data.maxCol}
                onClick={() => setLeft(left + COLS)}
              >
                {t('sources.grid.colsRight')}
              </button>
            </div>
            <span className="muted">
              {t('sources.grid.extent', {
                ref: data.maxRow > 0 ? cellRef({ row: data.maxRow, col: data.maxCol }) : 'A1',
              })}
            </span>
          </div>

          <div className="grid-layout">
            <div className="grid-main">
              {/* Barre de formule : Entrée enregistre, Échap rétablit le contenu. `expected`
                  est le contenu vu : si une validation l'a changé entre-temps, `409 EDIT_CONFLICT`. */}
              <form
                className="grid-formula-bar"
                onSubmit={(e: FormEvent) => {
                  e.preventDefault();
                  if (!editing || draft === initial) return;
                  save.mutate({
                    sheet: editing.sheet,
                    ...editing.position,
                    expected: {
                      display: current?.display ?? '',
                      formula: current?.formula ?? null,
                    },
                    input: storedInput(draft),
                  });
                }}
              >
                <strong>
                  {editing
                    ? `${editing.sheet === data.sheet ? '' : sheetPrefix(editing.sheet)}${cellRef(editing.position)}`
                    : '—'}
                </strong>
                <input
                  ref={editor}
                  aria-label={t('sources.grid.content')}
                  value={draft}
                  disabled={!editing || save.isPending}
                  onFocus={() => setFormulaEdit(true)}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    setCursor(e.target.selectionStart ?? e.target.value.length);
                    setInserted(null);
                  }}
                  onSelect={(e) => setCursor(e.currentTarget.selectionStart ?? 0)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Escape') return;
                    setDraft(initial);
                    setInserted(null);
                    setFormulaEdit(false);
                  }}
                />
                <button
                  type="submit"
                  className="button secondary"
                  disabled={!editing || save.isPending || draft === initial}
                >
                  {t('common.save')}
                </button>
                {/* Ligne toujours présente : la barre garde sa hauteur et la grille ne bouge pas. */}
                <span className="muted grid-recalc-note">
                  {current?.needsRecalc && t('render.needsRecalc')}
                </span>
              </form>
              <ErrorMessage error={save.error} />

              <div className="table-wrap">
                <table className={refMode ? 'source-grid ref-mode' : 'source-grid'}>
                  <thead>
                    <tr>
                      <th scope="col" />
                      {cols.map((col) => (
                        <th key={col} scope="col">
                          {columnLetters(col)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row}>
                        <th scope="row">{row}</th>
                        {cols.map((col) => {
                          const cell = cells.get(`${row}:${col}`);
                          const isSelected =
                            editing?.sheet === data.sheet &&
                            editing.position.row === row &&
                            editing.position.col === col;
                          const ref = refAt(row, col);
                          return (
                            <td
                              key={col}
                              className={[
                                cell?.type === 'number' || cell?.type === 'date' ? 'numeric' : '',
                                cell?.formula ? 'has-formula' : '',
                                isSelected ? 'selected' : '',
                                ref ? `ref-cell ref-color-${ref.color}` : '',
                                ref && hoveredRef === ref.token.start ? 'ref-hover' : '',
                              ].join(' ')}
                              aria-selected={isSelected}
                              onMouseDown={(e) => {
                                if (!refMode) return select({ row, col });
                                e.preventDefault();
                                insertRef({ row, col }, e.shiftKey);
                                dragging.current = true;
                              }}
                              onMouseEnter={() => {
                                if (dragging.current) insertRef({ row, col }, true);
                              }}
                              onDoubleClick={() => editor.current?.focus()}
                            >
                              {cell?.display}
                              {cell?.needsRecalc && <RecalcMark />}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <FormulaPanel
              hasCell={!!editing}
              parsed={parsed}
              cursor={Math.max(0, cursor - 1)}
              refMode={refMode}
              ctx={ctx}
              onInsert={insertFunction}
            />
          </div>
        </>
      )}
    </section>
  );
}
