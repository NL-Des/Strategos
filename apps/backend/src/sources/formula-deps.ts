import { type Rect, areaRect } from '@strategos/shared';

/**
 * Dépendances d'une formule (08 — `needs_recalc`) : les plages du **même
 * classeur** qu'elle cite. Rien n'est calculé ; on cherche seulement quelles
 * cellules deviennent « à recalculer » quand une valeur est écrite. Les
 * références à un autre classeur (`[1]Stock!B2`) passent par `cell_references`,
 * et les noms définis ne sont pas suivis.
 */
export interface FormulaRef {
  sheet: string;
  rect: Rect;
}

const SHEET = String.raw`(?:'((?:[^']|'')+)'|([A-Za-z_À-ɏ][\w.À-ɏ]*))!`;
const CELL = String.raw`\$?[A-Z]{1,3}\$?\d+`;
const AREA = String.raw`${CELL}(?::${CELL})?|\$?[A-Z]{1,3}:\$?[A-Z]{1,3}|\$?\d+:\$?\d+`;
// Ni collée à un nom (LOG10, A1B), ni suivie d'une parenthèse (fonction), ni
// précédée d'un « ] » (référence externe sans guillemets).
const REF = new RegExp(String.raw`(?<![\w.\]!$'"])(?:${SHEET})?(${AREA})(?![\w(!])`, 'g');

/** Plages citées par `formula`, dans le classeur ; `ownSheet` pour les références sans feuille. */
export function formulaRefs(formula: string, ownSheet: string): FormulaRef[] {
  // Les chaînes littérales ne contiennent pas de références.
  const code = formula.replace(/"(?:[^"]|"")*"/g, (s) => ' '.repeat(s.length));
  const refs: FormulaRef[] = [];
  for (const m of code.matchAll(REF)) {
    const quoted = m[1]?.replaceAll("''", "'");
    if (quoted?.startsWith('[')) continue; // '[1]Stock'!B2 : autre classeur
    const rect = areaRect(m[3]!);
    if (rect) refs.push({ sheet: quoted ?? m[2] ?? ownSheet, rect });
  }
  return refs;
}

export function rectContains(rect: Rect, row: number, col: number): boolean {
  return row >= rect.top && row <= rect.bottom && col >= rect.left && col <= rect.right;
}
