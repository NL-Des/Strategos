import { CellType } from '../enums.js';

/** Longueur maximale d'une formule (celle d'Excel). */
export const FORMULA_MAX_LENGTH = 8192;
/** Longueur maximale du texte d'une cellule (celle d'Excel). */
export const CELL_TEXT_MAX_LENGTH = 32_767;

/** Contenu d'une cellule saisi dans la grille : une valeur typée, ou une formule. */
export type CellInput =
  | { formula: null; type: CellType; text: string | null; number: number | null }
  | { formula: string };

const NUMBER_FR = /^-?\d{1,3}(?:\s\d{3})+(?:,\d+)?$|^-?\d+(?:[.,]\d+)?$/;
const DATE_FR = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const DATE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Numéro de série Excel d'une date UTC (jours depuis le 30/12/1899). */
const serial = (date: Date) => date.getTime() / 86_400_000 + 25_569;

function date(year: number, month: number, day: number): CellInput | null {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  return {
    formula: null,
    type: CellType.date,
    text: d.toISOString().slice(0, 10),
    number: serial(d),
  };
}

/**
 * Saisie d'une cellule comme dans Excel en français : `=…` est une formule ;
 * sinon vide, nombre (« 1 234,5 »), booléen (VRAI / FAUX), date (« 26/09/2026 »),
 * ou texte. Une apostrophe en tête force le texte (« '0612 »).
 */
export function parseCellInput(input: string): CellInput {
  if (input.startsWith('=') && input.length > 1) return { formula: input.slice(1) };
  if (input.startsWith("'")) {
    return { formula: null, type: CellType.text, text: input.slice(1), number: null };
  }
  const trimmed = input.trim();
  if (trimmed === '') return { formula: null, type: CellType.empty, text: null, number: null };
  if (NUMBER_FR.test(trimmed)) {
    const n = Number(trimmed.replace(/\s/g, '').replace(',', '.'));
    return { formula: null, type: CellType.number, text: String(n), number: n };
  }
  const upper = trimmed.toUpperCase();
  if (upper === 'VRAI' || upper === 'TRUE') {
    return { formula: null, type: CellType.bool, text: 'VRAI', number: 1 };
  }
  if (upper === 'FAUX' || upper === 'FALSE') {
    return { formula: null, type: CellType.bool, text: 'FAUX', number: 0 };
  }
  const fr = DATE_FR.exec(trimmed);
  const iso = DATE_ISO.exec(trimmed);
  const parsed = fr
    ? date(Number(fr[3]), Number(fr[2]), Number(fr[1]))
    : iso && date(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  if (parsed) return parsed;
  return { formula: null, type: CellType.text, text: input, number: null };
}
