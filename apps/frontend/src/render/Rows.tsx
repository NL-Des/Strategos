import type { AssembledRow, ColumnWidth } from '@strategos/shared';
import type { CSSProperties } from 'react';
import { BlockRenderer } from './blocks';

const FRACTION: Record<ColumnWidth, string> = {
  '1/1': '1fr',
  '1/2': '1fr',
  '1/3': '1fr',
  '2/3': '2fr',
};

/** Une zone : pile de rangées ; la répartition passe par `--cols`, que le CSS replie sur mobile et tablette. */
export function Rows({ rows }: { rows: AssembledRow[] }) {
  return (
    <>
      {rows.map((row) => (
        <div
          key={row.id}
          className={`layout-row cols-${row.columns.length}`}
          style={{ '--cols': row.columns.map((c) => FRACTION[c.width]).join(' ') } as CSSProperties}
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
