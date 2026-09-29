import { BLOCK_TYPES, type BlockType, type Block, ROW_LAYOUTS, type Row } from '@strategos/shared';
import { useTranslation } from 'react-i18next';
import { BlockEditor } from './BlockEditor';
import { newBlock, newRow } from './defaults';

const layoutKey = (row: Row) => row.columns.map((c) => c.width).join('+');

/** Une zone en construction : rangées de 1 à 3 colonnes, un module par colonne. */
export function RowsEditor({
  rows,
  onChange,
  allowedTypes = BLOCK_TYPES,
}: {
  rows: Row[];
  onChange: (rows: Row[]) => void;
  allowedTypes?: readonly BlockType[];
}) {
  const { t } = useTranslation();
  const setRow = (i: number, row: Row) => onChange(rows.map((r, j) => (i === j ? row : r)));
  const move = (i: number, delta: number) => {
    const next = [...rows];
    [next[i], next[i + delta]] = [next[i + delta]!, next[i]!];
    onChange(next);
  };

  return (
    <div className="rows-editor">
      {rows.map((row, i) => (
        <section key={row.id} className="card row-editor">
          <div className="row-toolbar">
            <strong>{t('builder.row', { n: i + 1 })}</strong>
            <select
              aria-label={t('builder.columnsLayout')}
              value={layoutKey(row)}
              onChange={(e) => {
                const widths = ROW_LAYOUTS.find((l) => l.join('+') === e.target.value)!;
                setRow(i, {
                  ...row,
                  columns: widths.map((width, c) => ({
                    width,
                    block: row.columns[c]?.block ?? null,
                  })),
                });
              }}
            >
              {ROW_LAYOUTS.map((l) => (
                <option key={l.join('+')} value={l.join('+')}>
                  {l.join(' + ')}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="secondary"
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              {t('builder.moveUp')}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={i === rows.length - 1}
              onClick={() => move(i, 1)}
            >
              {t('builder.moveDown')}
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
            >
              {t('builder.removeRow')}
            </button>
          </div>
          <div className="row-columns">
            {row.columns.map((column, c) => {
              const setBlock = (block: Block | null) =>
                setRow(i, {
                  ...row,
                  columns: row.columns.map((col, k) => (k === c ? { ...col, block } : col)),
                });
              return (
                <div key={c} className="column-editor">
                  <p className="muted">{t('builder.column', { n: c + 1, width: column.width })}</p>
                  {column.block ? (
                    <>
                      <div className="block-header">
                        <strong>{t(`builder.blockTypes.${column.block.type}`)}</strong>
                        <button type="button" className="danger" onClick={() => setBlock(null)}>
                          {t('builder.removeBlock')}
                        </button>
                      </div>
                      <BlockEditor block={column.block} onChange={setBlock} />
                    </>
                  ) : (
                    <select
                      aria-label={t('builder.addBlock')}
                      value=""
                      onChange={(e) => setBlock(newBlock(e.target.value as BlockType))}
                    >
                      <option value="">{t('builder.addBlock')}</option>
                      {allowedTypes.map((type) => (
                        <option key={type} value={type}>
                          {t(`builder.blockTypes.${type}`)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
      <button type="button" className="secondary" onClick={() => onChange([...rows, newRow()])}>
        {t('builder.addRow')}
      </button>
    </div>
  );
}
