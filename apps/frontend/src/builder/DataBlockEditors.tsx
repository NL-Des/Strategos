import {
  type Block,
  CATALOG_LAYOUTS,
  type CatalogLayout,
  CELL_FORMATS,
  type CellFormat,
  COLUMN_PATTERN,
  columnLetters,
  columnNumber,
  type DataSourceRef,
  parseColumnsRef,
  parseRangeRef,
  TABLE_PAGE_SIZES,
} from '@strategos/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { listSources } from '../api/sources';

type Props<B extends Block> = { block: B; onChange: (block: B) => void };

/** Sources de l'instance, partagées par les éditeurs de modules. */
export function useSources() {
  return useQuery({ queryKey: ['admin', 'sources'], queryFn: listSources });
}

/** Colonnes de la plage (« A », « B »…), pour proposer des choix valides. */
function rangeLetters(ref: DataSourceRef): string[] {
  const cols =
    ref.range.mode === 'fixed'
      ? parseRangeRef(ref.range.ref ?? '')
      : parseColumnsRef(ref.range.columns ?? '');
  if (!cols || cols.right - cols.left > 60) return [];
  return Array.from({ length: cols.right - cols.left + 1 }, (_, i) => columnLetters(cols.left + i));
}

/** Source, feuille, plage fixe ou extensible, et ligne d'en-têtes (06 — Plage des tableaux). */
function DataSourceFields<C extends DataSourceRef>({
  config,
  set,
}: {
  config: C;
  set: (patch: Partial<C>) => void;
}) {
  const { t } = useTranslation();
  const sources = useSources();
  const source = sources.data?.find((s) => s.id === config.sourceId);
  const range = config.range;
  const setRange = (patch: Partial<DataSourceRef['range']>) =>
    set({ range: { ...range, ...patch } } as Partial<C>);

  return (
    <fieldset>
      <legend>{t('builder.data.source')}</legend>
      <label>
        {t('builder.data.sourceFile')}
        <select
          value={config.sourceId}
          onChange={(e) => {
            const next = sources.data?.find((s) => s.id === e.target.value);
            set({ sourceId: e.target.value, sheet: next?.sheets[0] ?? '' } as Partial<C>);
          }}
        >
          <option value="">{t('builder.data.chooseSource')}</option>
          {sources.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('builder.data.sheet')}
        <select value={config.sheet} onChange={(e) => set({ sheet: e.target.value } as Partial<C>)}>
          {!source?.sheets.includes(config.sheet) && (
            <option value={config.sheet}>{config.sheet}</option>
          )}
          {source?.sheets.map((sheet) => (
            <option key={sheet} value={sheet}>
              {sheet}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('builder.data.rangeMode')}
        <select
          value={range.mode}
          onChange={(e) =>
            set({
              range:
                e.target.value === 'fixed'
                  ? { mode: 'fixed', ref: 'A1:D10' }
                  : { mode: 'extensible', columns: 'A:D', startRow: 1 },
            } as Partial<C>)
          }
        >
          <option value="extensible">{t('builder.data.extensible')}</option>
          <option value="fixed">{t('builder.data.fixed')}</option>
        </select>
        <small>{t(`builder.data.${range.mode}Hint`)}</small>
      </label>
      {range.mode === 'fixed' ? (
        <label>
          {t('builder.data.rangeRef')}
          <input
            value={range.ref ?? ''}
            placeholder="A1:D11"
            onChange={(e) => setRange({ ref: e.target.value.toUpperCase() })}
          />
        </label>
      ) : (
        <div className="inline-fields">
          <label>
            {t('builder.data.columns')}
            <input
              value={range.columns ?? ''}
              placeholder="A:D"
              onChange={(e) => setRange({ columns: e.target.value.toUpperCase() })}
            />
          </label>
          <label>
            {t('builder.data.startRow')}
            <input
              type="number"
              min={1}
              value={range.startRow ?? 1}
              onChange={(e) => setRange({ startRow: Number(e.target.value) })}
            />
          </label>
        </div>
      )}
      <label className="inline">
        <input
          type="checkbox"
          checked={config.headerRow}
          onChange={(e) => set({ headerRow: e.target.checked } as Partial<C>)}
        />
        {t('builder.data.headerRow')}
      </label>
    </fieldset>
  );
}

function FormatSelect({
  value,
  onChange,
}: {
  value: CellFormat;
  onChange: (f: CellFormat) => void;
}) {
  const { t } = useTranslation();
  return (
    <select
      aria-label={t('builder.data.format')}
      value={value}
      onChange={(e) => onChange(e.target.value as CellFormat)}
    >
      {CELL_FORMATS.map((f) => (
        <option key={f} value={f}>
          {t(`builder.data.formats.${f}`)}
        </option>
      ))}
    </select>
  );
}

/** Colonne du document, parmi celles de la plage (saisie libre si la plage est invalide). */
function ColumnSelect({
  value,
  letters,
  optional,
  label,
  onChange,
}: {
  value: string | undefined;
  letters: string[];
  optional?: boolean;
  label: string;
  onChange: (col: string | undefined) => void;
}) {
  const { t } = useTranslation();
  if (letters.length === 0) {
    return (
      <input
        aria-label={label}
        value={value ?? ''}
        onChange={(e) => {
          const col = e.target.value.toUpperCase();
          onChange(col || (optional ? undefined : ''));
        }}
      />
    );
  }
  return (
    <select
      aria-label={label}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
    >
      {optional && <option value="">{t('builder.data.none')}</option>}
      {value && !letters.includes(value) && <option value={value}>{value}</option>}
      {letters.map((l) => (
        <option key={l} value={l}>
          {l}
        </option>
      ))}
    </select>
  );
}

function PageSizeSelect({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const { t } = useTranslation();
  return (
    <label>
      {t('builder.data.pageSize')}
      <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {TABLE_PAGE_SIZES.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Tableau (06) : plage, colonnes affichées (libellé, format), pagination, tri, recherche. */
export function TableEditor({ block, onChange }: Props<Extract<Block, { type: 'table' }>>) {
  const { t } = useTranslation();
  const config = block.config;
  const set = (patch: Partial<typeof config>) =>
    onChange({ ...block, config: { ...config, ...patch } });
  const setColumn = (i: number, patch: Partial<(typeof config.columns)[number]>) =>
    set({ columns: config.columns.map((c, j) => (i === j ? { ...c, ...patch } : c)) });
  const letters = rangeLetters(config);
  const nextLetter = () => {
    const used = new Set(config.columns.map((c) => c.col));
    const last = config.columns.at(-1)?.col;
    return (
      letters.find((l) => !used.has(l)) ??
      (last && COLUMN_PATTERN.test(last) ? columnLetters(columnNumber(last) + 1) : 'A')
    );
  };

  return (
    <div className="form">
      <DataSourceFields config={config} set={set} />
      <fieldset>
        <legend>{t('builder.data.tableColumns')}</legend>
        <p className="muted">{t('builder.data.labelHint')}</p>
        {config.columns.map((column, i) => (
          <div key={i} className="inline-fields">
            <ColumnSelect
              label={t('builder.data.column')}
              value={column.col}
              letters={letters}
              onChange={(col) => setColumn(i, { col: col ?? '' })}
            />
            <input
              aria-label={t('builder.data.label')}
              placeholder={t('builder.data.label')}
              value={column.label}
              onChange={(e) => setColumn(i, { label: e.target.value })}
            />
            <FormatSelect value={column.format} onChange={(format) => setColumn(i, { format })} />
            <label className="inline">
              <input
                type="checkbox"
                checked={column.visible}
                onChange={(e) => setColumn(i, { visible: e.target.checked })}
              />
              {t('builder.data.visible')}
            </label>
            <button
              type="button"
              className="secondary"
              disabled={config.columns.length === 1}
              onClick={() => set({ columns: config.columns.filter((_, j) => j !== i) })}
            >
              {t('builder.remove')}
            </button>
          </div>
        ))}
        <button
          type="button"
          className="secondary"
          onClick={() =>
            set({
              columns: [
                ...config.columns,
                { col: nextLetter(), visible: true, label: '', format: 'text' },
              ],
            })
          }
        >
          {t('builder.data.addColumn')}
        </button>
      </fieldset>
      <PageSizeSelect value={config.pageSize} onChange={(pageSize) => set({ pageSize })} />
      <label className="inline">
        <input
          type="checkbox"
          checked={config.sortable}
          onChange={(e) => set({ sortable: e.target.checked })}
        />
        {t('builder.data.sortable')}
      </label>
      <label className="inline">
        <input
          type="checkbox"
          checked={config.searchable}
          onChange={(e) => set({ searchable: e.target.checked })}
        />
        {t('builder.data.searchable')}
      </label>
    </div>
  );
}

/** Catalogue (06) : mise en page de carte, emplacements → colonnes, détails. */
export function CatalogEditor({ block, onChange }: Props<Extract<Block, { type: 'catalog' }>>) {
  const { t } = useTranslation();
  const config = block.config;
  const set = (patch: Partial<typeof config>) =>
    onChange({ ...block, config: { ...config, ...patch } });
  const setDetail = (i: number, patch: Partial<(typeof config.details)[number]>) =>
    set({ details: config.details.map((d, j) => (i === j ? { ...d, ...patch } : d)) });
  const letters = rangeLetters(config);
  const slot = (key: 'imageCol' | 'titleCol' | 'subtitleCol') => (
    <label>
      {t(`builder.data.${key}`)}
      <ColumnSelect
        optional
        label={t(`builder.data.${key}`)}
        value={config[key]}
        letters={letters}
        onChange={(col) => set({ [key]: col })}
      />
    </label>
  );

  return (
    <div className="form">
      <DataSourceFields config={config} set={set} />
      <label>
        {t('builder.data.layout')}
        <select
          value={config.layout}
          onChange={(e) => set({ layout: e.target.value as CatalogLayout })}
        >
          {CATALOG_LAYOUTS.map((l) => (
            <option key={l} value={l}>
              {t(`builder.data.layouts.${l}`)}
            </option>
          ))}
        </select>
      </label>
      {slot('imageCol')}
      <small>{t('builder.data.imageHint')}</small>
      {slot('titleCol')}
      {slot('subtitleCol')}
      <fieldset>
        <legend>{t('builder.data.details')}</legend>
        {config.details.map((detail, i) => (
          <div key={i} className="inline-fields">
            <ColumnSelect
              label={t('builder.data.column')}
              value={detail.col}
              letters={letters}
              onChange={(col) => setDetail(i, { col: col ?? '' })}
            />
            <input
              aria-label={t('builder.data.label')}
              placeholder={t('builder.data.label')}
              value={detail.label}
              onChange={(e) => setDetail(i, { label: e.target.value })}
            />
            <FormatSelect value={detail.format} onChange={(format) => setDetail(i, { format })} />
            <button
              type="button"
              className="secondary"
              onClick={() => set({ details: config.details.filter((_, j) => j !== i) })}
            >
              {t('builder.remove')}
            </button>
          </div>
        ))}
        <button
          type="button"
          className="secondary"
          onClick={() =>
            set({
              details: [...config.details, { col: letters[0] ?? 'A', label: '', format: 'text' }],
            })
          }
        >
          {t('builder.data.addDetail')}
        </button>
      </fieldset>
      <label>
        {t('builder.data.perRow')}
        <select value={config.perRow} onChange={(e) => set({ perRow: Number(e.target.value) })}>
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <PageSizeSelect value={config.pageSize} onChange={(pageSize) => set({ pageSize })} />
      <label className="inline">
        <input
          type="checkbox"
          checked={config.searchable}
          onChange={(e) => set({ searchable: e.target.checked })}
        />
        {t('builder.data.searchable')}
      </label>
    </div>
  );
}
