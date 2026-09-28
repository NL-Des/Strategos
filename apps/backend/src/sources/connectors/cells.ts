import { CellType } from '@strategos/shared';
import type { StoredCell } from '../cell-format.js';
import { fromSerial } from '../cell-format.js';
import { dateText } from '../excel-parser.js';
import type { StoredValue } from '../source-write.service.js';

/**
 * Conversion des cellules des API Google Sheets et Microsoft Graph vers la
 * représentation commune (celle du staging) : les appelants ne savent pas de
 * quel type est la source. Aucune formule n'est évaluée.
 */

/** Cellule d'une source connectée, avec sa formule (avertissement « cellule-formule »). */
export interface RemoteCell extends StoredCell {
  formula: string | null;
}

const empty = (formula: string | null): RemoteCell => ({
  type: CellType.empty,
  text: null,
  number: null,
  needsRecalc: false,
  formula,
});

function numberCell(n: number, isDate: boolean, formula: string | null): RemoteCell {
  return isDate
    ? { type: CellType.date, text: dateText(fromSerial(n)), number: n, needsRecalc: false, formula }
    : { type: CellType.number, text: String(n), number: n, needsRecalc: false, formula };
}

/** Cellule de `spreadsheets.get` (`includeGridData`). */
export interface SheetsCellData {
  effectiveValue?: {
    numberValue?: number;
    stringValue?: string;
    boolValue?: boolean;
    errorValue?: { type?: string; message?: string };
  };
  userEnteredValue?: { formulaValue?: string };
  effectiveFormat?: { numberFormat?: { type?: string } };
}

export function sheetsCell(data: SheetsCellData): RemoteCell | null {
  const formula = data.userEnteredValue?.formulaValue ?? null;
  const v = data.effectiveValue;
  if (!v) return formula ? empty(formula) : null;
  if (v.numberValue !== undefined) {
    const format = data.effectiveFormat?.numberFormat?.type;
    return numberCell(v.numberValue, format === 'DATE' || format === 'DATE_TIME', formula);
  }
  if (v.boolValue !== undefined) {
    return {
      type: CellType.bool,
      text: v.boolValue ? 'VRAI' : 'FAUX',
      number: v.boolValue ? 1 : 0,
      needsRecalc: false,
      formula,
    };
  }
  if (v.errorValue) {
    return {
      type: CellType.error,
      text: v.errorValue.type ?? '#ERROR!',
      number: null,
      needsRecalc: false,
      formula,
    };
  }
  if (v.stringValue === undefined || v.stringValue === '') return formula ? empty(formula) : null;
  return { type: CellType.text, text: v.stringValue, number: null, needsRecalc: false, formula };
}

/** Format de nombre Excel qui affiche une date (« dd/mm/yyyy », « m/d/yy h:mm »). */
export function isDateFormat(format: string): boolean {
  const code = format
    .replace(/"[^"]*"/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\\./g, '');
  return /[dy]/i.test(code);
}

/** Cellule de `usedRange` (Graph) : valeur, type, formule et format de nombre. */
export function graphCell(
  value: unknown,
  valueType: string,
  formula: unknown,
  numberFormat: unknown,
): RemoteCell | null {
  const f = typeof formula === 'string' && formula.startsWith('=') ? formula.slice(1) : null;
  switch (valueType) {
    case 'Double':
      return typeof value === 'number'
        ? numberCell(value, typeof numberFormat === 'string' && isDateFormat(numberFormat), f)
        : null;
    case 'Boolean':
      return {
        type: CellType.bool,
        text: value ? 'VRAI' : 'FAUX',
        number: value ? 1 : 0,
        needsRecalc: false,
        formula: f,
      };
    case 'Error':
      return {
        type: CellType.error,
        text: String(value),
        number: null,
        needsRecalc: false,
        formula: f,
      };
    case 'String':
      return value === ''
        ? f
          ? empty(f)
          : null
        : {
            type: CellType.text,
            text: String(value),
            number: null,
            needsRecalc: false,
            formula: f,
          };
    default:
      return f ? empty(f) : null;
  }
}

/**
 * Valeur brute envoyée à l'API (écriture sans interprétation) : nombre, booléen
 * ou texte ; une date devient son numéro de série, qui garde le format de la cellule.
 */
export function rawValue(value: StoredValue): string | number | boolean {
  switch (value.type) {
    case CellType.number:
    case CellType.date:
      return value.number ?? '';
    case CellType.bool:
      return value.number === 1;
    case CellType.empty:
      return '';
    default:
      return value.text ?? '';
  }
}

/** Identifiant d'un Google Sheet depuis son lien (`/spreadsheets/d/<id>/…`) ou l'identifiant seul. */
export function spreadsheetIdOf(url: string): string | null {
  const trimmed = url.trim();
  const m = /\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/.exec(trimmed);
  if (m) return m[1]!;
  return /^[A-Za-z0-9_-]{20,}$/.test(trimmed) ? trimmed : null;
}

/** « 'Mes stocks'!B2 » : feuille citée dans une plage A1. */
export function quoteSheet(sheet: string): string {
  return `'${sheet.replaceAll("'", "''")}'`;
}
