import { BLOCK_TYPES, type BlockType, type Block, ROW_LAYOUTS, type Row } from '@strategos/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useConfirmed } from '../components/Dialog';
import { Icon } from '../components/Icon';
import { BlockEditor } from './BlockEditor';
import { newBlock, newRow } from './defaults';

const layoutKey = (row: Row) => row.columns.map((c) => c.width).join('+');

/**
 * Une zone en construction : rangées de 1 à 3 colonnes, un module par colonne.
 * Les rangées déjà enregistrées s'ouvrent repliées, résumées par leurs modules,
 * pour garder la page lisible d'un coup d'œil ; une rangée ajoutée est dépliée.
 */
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
  const confirmed = useConfirmed();
  const [collapsed, setCollapsed] = useState(() => new Set(rows.map((row) => row.id)));
  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const setRow = (i: number, row: Row) => onChange(rows.map((r, j) => (i === j ? row : r)));
  const move = (i: number, delta: number) => {
    const next = [...rows];
    [next[i], next[i + delta]] = [next[i + delta]!, next[i]!];
    onChange(next);
  };
  const insert = (i: number) => onChange([...rows.slice(0, i), newRow(), ...rows.slice(i)]);
  const summary = (row: Row) =>
    row.columns
      .map((c) => (c.block ? t(`builder.blockTypes.${c.block.type}`) : t('builder.emptyColumn')))
      .join(' · ');

  return (
    <div className="rows-editor">
      {rows.length > 1 && (
        <div className="actions rows-fold">
          <button
            type="button"
            className="link"
            disabled={collapsed.size === 0}
            onClick={() => setCollapsed(new Set())}
          >
            {t('builder.expandAll')}
          </button>
          <button
            type="button"
            className="link"
            disabled={rows.every((row) => collapsed.has(row.id))}
            onClick={() => setCollapsed(new Set(rows.map((row) => row.id)))}
          >
            {t('builder.collapseAll')}
          </button>
        </div>
      )}
      {rows.map((row, i) => {
        const open = !collapsed.has(row.id);
        const hasBlocks = row.columns.some((c) => c.block);
        return (
          <div key={row.id} className="row-slot">
            {i > 0 && (
              <button
                type="button"
                className="link row-insert"
                aria-label={t('builder.insertRow')}
                title={t('builder.insertRow')}
                onClick={() => insert(i)}
              >
                <Icon name="plus" size={14} />
              </button>
            )}
            <section className={open ? 'card row-editor' : 'card row-editor collapsed'}>
              <div className="row-toolbar">
                <button
                  type="button"
                  className="link row-toggle"
                  aria-expanded={open}
                  aria-label={t(open ? 'builder.collapseRow' : 'builder.expandRow', { n: i + 1 })}
                  onClick={() => toggle(row.id)}
                >
                  <Icon name={open ? 'chevronDown' : 'chevronRight'} />
                </button>
                <strong>{t('builder.row', { n: i + 1 })}</strong>
                <span className="muted row-summary">{summary(row)}</span>
                <div className="row-tools">
                  {open && (
                    <select
                      aria-label={t('builder.columnsLayout')}
                      value={layoutKey(row)}
                      onChange={(e) => {
                        const widths = ROW_LAYOUTS.find((l) => l.join('+') === e.target.value)!;
                        const apply = () =>
                          setRow(i, {
                            ...row,
                            columns: widths.map((width, c) => ({
                              width,
                              block: row.columns[c]?.block ?? null,
                            })),
                          });
                        // Une colonne retirée emporte son module : on le dit avant.
                        if (row.columns.slice(widths.length).some((c) => c.block)) {
                          confirmed({ title: t('builder.layoutDropsBlocks'), danger: true }, apply);
                        } else apply();
                      }}
                    >
                      {ROW_LAYOUTS.map((l) => (
                        <option key={l.join('+')} value={l.join('+')}>
                          {l.join(' + ')}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    className="secondary icon-button"
                    aria-label={t('builder.moveUp')}
                    title={t('builder.moveUp')}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <Icon name="chevronUp" />
                  </button>
                  <button
                    type="button"
                    className="secondary icon-button"
                    aria-label={t('builder.moveDown')}
                    title={t('builder.moveDown')}
                    disabled={i === rows.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <Icon name="chevronDown" />
                  </button>
                  <button
                    type="button"
                    className="danger icon-button"
                    aria-label={t('builder.removeRow')}
                    title={t('builder.removeRow')}
                    onClick={() => {
                      const remove = () => onChange(rows.filter((_, j) => j !== i));
                      if (hasBlocks) {
                        confirmed(
                          {
                            title: t('builder.removeRowConfirm', { n: i + 1 }),
                            message: summary(row),
                            confirmLabel: t('common.delete'),
                            danger: true,
                          },
                          remove,
                        );
                      } else remove();
                    }}
                  >
                    <Icon name="trash" />
                  </button>
                </div>
              </div>
              {open && (
                <div className="row-columns">
                  {row.columns.map((column, c) => {
                    const setBlock = (block: Block | null) =>
                      setRow(i, {
                        ...row,
                        columns: row.columns.map((col, k) => (k === c ? { ...col, block } : col)),
                      });
                    return (
                      <div key={c} className="column-editor">
                        {row.columns.length > 1 && (
                          <p className="muted column-label">
                            {t('builder.column', { n: c + 1, width: column.width })}
                          </p>
                        )}
                        {column.block ? (
                          <>
                            <div className="block-header">
                              <strong>{t(`builder.blockTypes.${column.block.type}`)}</strong>
                              <button
                                type="button"
                                className="link danger-link"
                                onClick={() =>
                                  confirmed(
                                    {
                                      title: t('builder.removeBlockConfirm', {
                                        type: t(`builder.blockTypes.${column.block!.type}`),
                                      }),
                                      confirmLabel: t('builder.removeBlock'),
                                      danger: true,
                                    },
                                    () => setBlock(null),
                                  )
                                }
                              >
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
              )}
            </section>
          </div>
        );
      })}
      <button type="button" className="secondary" onClick={() => onChange([...rows, newRow()])}>
        <Icon name="plus" />
        {t('builder.addRow')}
      </button>
    </div>
  );
}
