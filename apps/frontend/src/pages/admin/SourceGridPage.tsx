import {
  type CellPosition,
  type GridCell,
  cellRef,
  columnLetters,
  parseCellRef,
} from '@strategos/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { getSourceGrid, listSources } from '../../api/sources';
import { ErrorMessage } from '../../components/ErrorMessage';
import { RecalcMark } from '../../render/DataBlocks';

const ROWS = 50;
const COLS = 26;

/** Première ligne ou colonne de la fenêtre qui contient `n`. */
const windowStart = (n: number, size: number) => Math.floor((n - 1) / size) * size + 1;

/**
 * Admin › Sources › cellules (04) : la copie de référence d'un Excel uploadé,
 * vue comme un tableur, par fenêtres de 50 lignes × 26 colonnes.
 */
export function SourceGridPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const [sheet, setSheet] = useState<string | undefined>();
  const [top, setTop] = useState(1);
  const [left, setLeft] = useState(1);
  const [selected, setSelected] = useState<CellPosition | null>(null);
  const [goTo, setGoTo] = useState('');
  const [goToError, setGoToError] = useState(false);

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
  const current = selected ? cells.get(`${selected.row}:${selected.col}`) : undefined;

  const openSheet = (next: string) => {
    setSheet(next);
    setTop(1);
    setLeft(1);
    setSelected(null);
  };

  const submitGoTo = (e: FormEvent) => {
    e.preventDefault();
    const position = parseCellRef(goTo);
    setGoToError(!position);
    if (!position) return;
    setTop(windowStart(position.row, ROWS));
    setLeft(windowStart(position.col, COLS));
    setSelected(position);
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

          <div className="grid-formula-bar" aria-live="polite">
            <strong>{selected ? cellRef(selected) : '—'}</strong>
            <code>
              {current ? (current.formula ? `=${current.formula}` : current.display) : ''}
            </code>
            {current?.needsRecalc && <span className="muted">{t('render.needsRecalc')}</span>}
          </div>

          <div className="table-wrap">
            <table className="source-grid">
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
                      const isSelected = selected?.row === row && selected.col === col;
                      return (
                        <td
                          key={col}
                          className={[
                            cell?.type === 'number' || cell?.type === 'date' ? 'numeric' : '',
                            cell?.formula ? 'has-formula' : '',
                            isSelected ? 'selected' : '',
                          ].join(' ')}
                          aria-selected={isSelected}
                          onClick={() => setSelected({ row, col })}
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
        </>
      )}
    </section>
  );
}
