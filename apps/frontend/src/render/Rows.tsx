import type { AssembledRow, ColumnWidth } from '@strategos/shared';
import { BlockRenderer } from './blocks';

const FRACTION: Record<ColumnWidth, string> = {
  '1/1': '1fr',
  '1/2': '1fr',
  '1/3': '1fr',
  '2/3': '2fr',
};

/** Une zone : pile de rangées ; sur mobile, les colonnes s'empilent (CSS). */
export function Rows({ rows }: { rows: AssembledRow[] }) {
  return (
    <>
      {rows.map((row) => (
        <div
          key={row.id}
          className="layout-row"
          style={{ gridTemplateColumns: row.columns.map((c) => FRACTION[c.width]).join(' ') }}
        >
          {row.columns.map((column, i) => (
            <div key={column.block?.id ?? i} className="layout-column">
              {column.block && <BlockRenderer block={column.block} />}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
