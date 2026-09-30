import type { CellPosition, RefInfo, Token } from '@strategos/shared';
import { cellRef } from '@strategos/shared';

/** Couleurs des références d'une formule, dans la grille et le panneau (comme Excel). */
export const REF_COLORS = 6;

/** Référence colorée de la formule en cours : son rang donne sa couleur. */
export interface ColoredRef {
  token: Token & { ref: RefInfo };
  color: number;
}

export function coloredRefs(tokens: Token[]): ColoredRef[] {
  return tokens
    .filter((t): t is Token & { ref: RefInfo } => t.type === 'ref' && !t.ref!.external)
    .map((token, i) => ({ token, color: i % REF_COLORS }));
}

/** Feuille réelle d'une référence (casse indifférente, comme Excel) ; `null` si inconnue. */
export function resolveSheet(ref: RefInfo, ownSheet: string, sheets: string[]): string | null {
  const name = ref.sheet ?? ownSheet;
  return sheets.find((s) => s.toLowerCase() === name.toLowerCase()) ?? null;
}

/** « Stock! » ou « 'Mes ventes'! » : préfixe d'une référence vers une autre feuille. */
export function sheetPrefix(sheet: string): string {
  const plain = /^[A-Za-z_À-ɏ][\w.À-ɏ]*$/.test(sheet) && !/^[A-Za-z]{1,3}\d+$/.test(sheet);
  return plain ? `${sheet}!` : `'${sheet.replaceAll("'", "''")}'!`;
}

/** « B2 », ou « B2:C5 » pour deux coins d'une plage. */
export function areaText(a: CellPosition, b: CellPosition): string {
  if (a.row === b.row && a.col === b.col) return cellRef(a);
  const topLeft = { row: Math.min(a.row, b.row), col: Math.min(a.col, b.col) };
  const bottomRight = { row: Math.max(a.row, b.row), col: Math.max(a.col, b.col) };
  return `${cellRef(topLeft)}:${cellRef(bottomRight)}`;
}
