import {
  type DataSourceRef,
  parseColumnsRef,
  parseRangeRef,
  type Rect,
  columnNumber,
} from '@strategos/shared';

/** Colonnes couvertes par la plage d'un module. */
export function rangeColumns(ref: DataSourceRef): { left: number; right: number } | null {
  if (ref.range.mode === 'fixed') {
    const rect = parseRangeRef(ref.range.ref ?? '');
    return rect && { left: rect.left, right: rect.right };
  }
  return parseColumnsRef(ref.range.columns ?? '');
}

/**
 * Rectangle lu par un module. Une plage extensible s'arrête à la dernière ligne
 * remplie de ses colonnes (`lastFilledRow`, `null` si elles sont vides).
 */
export function rangeRect(ref: DataSourceRef, lastFilledRow: number | null): Rect | null {
  if (ref.range.mode === 'fixed') return parseRangeRef(ref.range.ref ?? '');
  const cols = parseColumnsRef(ref.range.columns ?? '');
  const top = ref.range.startRow ?? 1;
  if (!cols) return null;
  return { top, left: cols.left, right: cols.right, bottom: Math.max(top - 1, lastFilledRow ?? 0) };
}

/** La colonne (« C ») est-elle dans la plage du module ? */
export function inRange(ref: DataSourceRef, col: string): boolean {
  const cols = rangeColumns(ref);
  const n = columnNumber(col);
  return !!cols && n >= cols.left && n <= cols.right;
}

/** Ligne d'en-têtes du module (première ligne de la plage), ou `null` sans en-têtes. */
export function headerRow(ref: DataSourceRef): number | null {
  if (!ref.headerRow) return null;
  if (ref.range.mode === 'fixed') return parseRangeRef(ref.range.ref ?? '')?.top ?? null;
  return ref.range.startRow ?? 1;
}
