import { type CellFormat, CellType, type RowCell } from '@strategos/shared';

/** Valeur d'une cellule telle que lue dans une source (staging ou cache). */
export interface StoredCell {
  type: CellType;
  text: string | null;
  number: number | null;
  needsRecalc: boolean;
}

/** Clé d'une cellule dans une feuille lue : « ligne:colonne ». */
export const positionKey = (row: number, col: number) => `${row}:${col}`;

export const EMPTY_CELL: StoredCell = {
  type: CellType.empty,
  text: null,
  number: null,
  needsRecalc: false,
};

const numberFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 10 });
const currencyFormat = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeZone: 'UTC' });
const dateTimeFormat = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'UTC',
});

/** Numéro de série Excel → date (UTC). */
export function fromSerial(serial: number): Date {
  return new Date(Math.round((serial - 25_569) * 86_400_000));
}

const isWebUrl = (text: string) => /^https?:\/\/\S+$/i.test(text);

/**
 * Texte affiché d'une cellule selon le format choisi par l'admin (06). Le
 * formatage est fait côté backend : le frontend affiche tel quel.
 */
export function formatText(cell: StoredCell, format: CellFormat): string {
  if (cell.type === CellType.empty) return '';
  const n = cell.number;
  switch (format) {
    case 'number':
      return n !== null && cell.type !== CellType.bool ? numberFormat.format(n) : (cell.text ?? '');
    case 'currency':
      return n !== null && cell.type !== CellType.bool
        ? currencyFormat.format(n)
        : (cell.text ?? '');
    case 'date': {
      if (n === null || cell.type === CellType.bool) return cell.text ?? '';
      const date = fromSerial(n);
      return Number.isInteger(n) || cell.text?.length === 10
        ? dateFormat.format(date)
        : dateTimeFormat.format(date);
    }
    default:
      return cell.text ?? '';
  }
}

/**
 * Cellule d'une ligne de Tableau ou d'une carte. `imageUrl` résout un nom de
 * fichier de la médiathèque ou un lien web ; `null` → image par défaut.
 */
export function formatRowCell(
  cell: StoredCell,
  format: CellFormat,
  imageUrl: (text: string) => string | null,
): RowCell {
  const value = formatText(cell, format);
  const base = { value, needsRecalc: cell.needsRecalc };
  if (format === 'link') return isWebUrl(value) ? { ...base, href: value } : base;
  if (format === 'image') return { ...base, image: value ? imageUrl(value) : null };
  return base;
}

/** Adresse d'image d'un catalogue : lien web tel quel, sinon nom de fichier de la médiathèque. */
export function imageResolver(mediaByName: Map<string, string>) {
  return (text: string): string | null =>
    isWebUrl(text) ? text : (mediaByName.get(text.trim().toLowerCase()) ?? null);
}
