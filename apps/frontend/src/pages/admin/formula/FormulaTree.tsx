import {
  type FormulaNode,
  type GridCell,
  MAX_COLUMN,
  MAX_ROW,
  type RefInfo,
  type FormulaTarget,
  argumentAt,
  functionFor,
} from '@strategos/shared';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { getSourceGrid } from '../../../api/sources';
import { RecalcMark } from '../../../render/DataBlocks';
import { resolveSheet } from './refs';

const OPS: Record<string, string> = {
  '+': 'add',
  '-': 'subtract',
  '*': 'multiply',
  '/': 'divide',
  '^': 'power',
  '&': 'concat',
  '=': 'eq',
  '<>': 'ne',
  '<': 'lt',
  '<=': 'le',
  '>': 'gt',
  '>=': 'ge',
};

/**
 * Cellule chargée : `GridCell`, `null` si elle est vide, `undefined` si elle
 * est hors de la fenêtre affichée (elle est alors lue à part).
 */
export type CellLookup = (sheet: string, row: number, col: number) => GridCell | null | undefined;

export interface TreeContext {
  sourceId: string;
  /** Tableur de la source : signatures et fonctions proposées en dépendent. */
  target: FormulaTarget;
  /** Formule sans « = », telle que saisie : chaque nœud en montre son extrait. */
  formula: string;
  /** Feuille de la cellule éditée : celle des références sans feuille. */
  ownSheet: string;
  sheets: string[];
  lookup: CellLookup;
  /** Couleur d'une référence, par sa position dans la formule. */
  colorAt: (start: number) => number | undefined;
  onHoverRef: (start: number | null) => void;
}

/**
 * Décomposition d'une formule en arbre : fonctions et leurs arguments nommés,
 * opérations, références avec leur valeur enregistrée. Rien n'est calculé
 * (08) : aucun résultat intermédiaire n'est affiché.
 */
export function FormulaTree({ root, ctx }: { root: FormulaNode; ctx: TreeContext }) {
  return (
    <ul className="formula-tree">
      <TreeNode node={root} ctx={ctx} />
    </ul>
  );
}

function TreeNode({ node, ctx, role }: { node: FormulaNode; ctx: TreeContext; role?: string }) {
  const { t } = useTranslation();
  const n = (key: string, options?: Record<string, unknown>) =>
    t(`sources.grid.formula.nodes.${key}`, options);
  const snippet = ctx.formula.slice(node.start, node.end);
  let title: ReactNode;
  let detail: ReactNode = null;
  let children: { node: FormulaNode; role?: string }[] = [];

  switch (node.kind) {
    case 'call': {
      const fn = node.fn && functionFor(node.fn, ctx.target);
      title = <strong>{fn?.fr ?? node.name.toUpperCase()}</strong>;
      detail = fn ? t(`formulas.functions.${fn.en}`) : t('sources.grid.formula.unknownFunction');
      children = node.args.map((arg, i) => {
        const spec = fn && argumentAt(fn, i);
        return {
          node: arg,
          role: spec
            ? t(`formulas.args.${spec.key}.label`)
            : fn
              ? t('sources.grid.formula.extraArg')
              : undefined,
        };
      });
      break;
    }
    case 'binary':
      title = t(`sources.grid.formula.ops.${OPS[node.op]}`);
      children = [{ node: node.left }, { node: node.right }];
      break;
    case 'unary':
      title = n(node.op === '-' ? 'negate' : 'plus');
      children = [{ node: node.operand }];
      break;
    case 'percent':
      title = n('percent');
      children = [{ node: node.operand }];
      break;
    case 'group':
      title = n('group');
      children = [{ node: node.inner }];
      break;
    case 'ref':
      return (
        <li
          className="formula-node formula-ref"
          onMouseEnter={() => ctx.onHoverRef(node.start)}
          onMouseLeave={() => ctx.onHoverRef(null)}
        >
          <RefLine role={role} text={node.text} refInfo={node.ref} ctx={ctx} start={node.start} />
        </li>
      );
    default:
      title = n(node.kind);
  }

  const head = (
    <>
      {role && <span className="formula-role">{role}</span>}
      <span>{title}</span>
      {node.kind !== 'empty' && node.kind !== 'missing' && <code>{snippet}</code>}
    </>
  );
  if (children.length === 0) {
    return (
      <li className={`formula-node formula-${node.kind}`}>
        <div className="formula-head">{head}</div>
        {detail && <p className="muted">{detail}</p>}
      </li>
    );
  }
  return (
    <li className={`formula-node formula-${node.kind}`}>
      <details open>
        <summary className="formula-head">{head}</summary>
        {detail && <p className="muted">{detail}</p>}
        <ul>
          {children.map((c, i) => (
            <TreeNode key={i} node={c.node} role={c.role} ctx={ctx} />
          ))}
        </ul>
      </details>
    </li>
  );
}

function RefLine({
  role,
  text,
  refInfo,
  ctx,
  start,
}: {
  role?: string;
  text: string;
  refInfo: RefInfo;
  ctx: TreeContext;
  start: number;
}) {
  const { t } = useTranslation();
  const n = (key: string, options?: Record<string, unknown>) =>
    t(`sources.grid.formula.nodes.${key}`, options);
  const color = ctx.colorAt(start);
  const sheet = refInfo.external ? null : resolveSheet(refInfo, ctx.ownSheet, ctx.sheets);
  const rect = refInfo.rect;
  const single = !!rect && rect.top === rect.bottom && rect.left === rect.right;
  let detail: ReactNode;
  if (refInfo.external) detail = n('external');
  else if (!sheet) detail = n('sheetNotFound');
  else if (!rect) detail = null;
  else if (rect.top === 1 && rect.bottom === MAX_ROW) detail = n('columns');
  else if (rect.left === 1 && rect.right === MAX_COLUMN) detail = n('rows');
  else if (single) {
    detail = <CellValue sheet={sheet} row={rect.top} col={rect.left} ctx={ctx} />;
  } else {
    detail = n('range', { rows: rect.bottom - rect.top + 1, cols: rect.right - rect.left + 1 });
  }

  return (
    <>
      <div className="formula-head">
        {role && <span className="formula-role">{role}</span>}
        <span>{n(single ? 'cell' : 'reference')}</span>
        <code className={color === undefined ? undefined : `ref-color-${color}`}>{text}</code>
      </div>
      {detail && <p className="muted">{detail}</p>}
    </>
  );
}

/** Valeur enregistrée d'une cellule citée : dans la fenêtre affichée, sinon lue à part. */
function CellValue({
  sheet,
  row,
  col,
  ctx,
}: {
  sheet: string;
  row: number;
  col: number;
  ctx: TreeContext;
}) {
  const { t } = useTranslation();
  const loaded = ctx.lookup(sheet, row, col);
  const single = useQuery({
    queryKey: ['admin', 'sources', ctx.sourceId, 'cells', 'one', sheet, row, col],
    queryFn: () => getSourceGrid(ctx.sourceId, { sheet, top: row, left: col, rows: 1, cols: 1 }),
    enabled: loaded === undefined,
  });
  const cell = loaded === undefined ? single.data?.cells[0] : loaded;
  if (loaded === undefined && !single.data) return <>{t('common.loading')}</>;
  return (
    <>
      {cell
        ? t('sources.grid.formula.nodes.value', { value: cell.display })
        : t('sources.grid.formula.nodes.emptyValue')}
      {cell?.needsRecalc && <RecalcMark />}
    </>
  );
}
