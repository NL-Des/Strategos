/**
 * Références de cellules et de plages (« B2 », « A1:D11 », colonnes « A:D »).
 * Les lignes et colonnes sont numérotées à partir de 1 (colonne 1 = A), comme
 * dans `staging_cells`.
 */

export const MAX_COLUMN = 16_384; // XFD
export const MAX_ROW = 1_048_576;

export const CELL_REF_PATTERN = /^\$?([A-Z]{1,3})\$?([1-9]\d{0,6})$/;
export const RANGE_REF_PATTERN = /^\$?[A-Z]{1,3}\$?[1-9]\d{0,6}:\$?[A-Z]{1,3}\$?[1-9]\d{0,6}$/;
export const COLUMNS_REF_PATTERN = /^[A-Z]{1,3}:[A-Z]{1,3}$/;
export const COLUMN_PATTERN = /^[A-Z]{1,3}$/;

export interface CellPosition {
  row: number;
  col: number;
}

/** Rectangle de cellules, bornes incluses. */
export interface Rect {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export function columnNumber(letters: string): number {
  let n = 0;
  for (const c of letters) n = n * 26 + (c.charCodeAt(0) - 64);
  return n;
}

export function columnLetters(n: number): string {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) {
    s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  }
  return s;
}

/** « B2 » → `{ row: 2, col: 2 }` ; `null` si la référence est invalide. */
export function parseCellRef(ref: string): CellPosition | null {
  const m = CELL_REF_PATTERN.exec(ref.trim().toUpperCase());
  if (!m) return null;
  const col = columnNumber(m[1]!);
  const row = Number(m[2]);
  return col <= MAX_COLUMN && row <= MAX_ROW ? { row, col } : null;
}

export function cellRef({ row, col }: CellPosition): string {
  return `${columnLetters(col)}${row}`;
}

/** « A1:D11 » (ou une seule cellule) → rectangle normalisé. */
export function parseRangeRef(ref: string): Rect | null {
  const [a, b = a] = ref.trim().toUpperCase().split(':');
  const start = parseCellRef(a ?? '');
  const end = parseCellRef(b ?? '');
  if (!start || !end) return null;
  return {
    top: Math.min(start.row, end.row),
    bottom: Math.max(start.row, end.row),
    left: Math.min(start.col, end.col),
    right: Math.max(start.col, end.col),
  };
}

/** « A:D » → `{ left: 1, right: 4 }`. */
export function parseColumnsRef(ref: string): { left: number; right: number } | null {
  if (!COLUMNS_REF_PATTERN.test(ref)) return null;
  const [a, b] = ref.split(':').map(columnNumber) as [number, number];
  if (a > MAX_COLUMN || b > MAX_COLUMN) return null;
  return { left: Math.min(a, b), right: Math.max(a, b) };
}
