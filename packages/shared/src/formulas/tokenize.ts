import { MAX_COLUMN, MAX_ROW, type Rect, columnNumber, parseRangeRef } from '../sources/refs.js';

/**
 * Découpage d'une formule Excel (sans le « = ») en jetons, pour la décomposer
 * et la convertir entre la syntaxe du fichier (`en` : `SUM(A1,1.5)`) et celle
 * d'Excel en français (`fr` : `SOMME(A1;1,5)`), ou celle d'un Google Sheet
 * (noms anglais, séparateurs de la langue du classeur). Rien n'est calculé.
 * Tolérant : une formule en cours de saisie donne des jetons, jamais une exception.
 */
export type FormulaLocale = 'en' | 'fr';

export type TokenType =
  | 'string'
  | 'number'
  | 'bool'
  | 'error'
  | 'ref'
  | 'func'
  | 'name'
  | 'op'
  | 'open'
  | 'close'
  | 'sep'
  | 'arrayOpen'
  | 'arrayClose'
  | 'arrayCol'
  | 'arrayRow'
  | 'space'
  | 'unknown';

/** Référence citée : feuille (`null` : celle de la cellule), zone (« B2:B10 »), autre classeur. */
export interface RefInfo {
  sheet: string | null;
  area: string;
  /** Rectangle de la zone ; colonnes et lignes entières vont jusqu'aux bornes d'Excel. */
  rect: Rect | null;
  /** `[1]Stock!B2` : un autre classeur, non suivi. */
  external: boolean;
}

export interface Token {
  type: TokenType;
  text: string;
  start: number;
  end: number;
  ref?: RefInfo;
}

/** Séparateurs d'une formule : arguments, décimales, colonnes et lignes d'une matrice. */
export interface FormulaSyntax {
  sep: string;
  decimal: string;
  arrayCol: string;
  arrayRow: string;
}

export const FORMULA_SYNTAX: Record<FormulaLocale, FormulaSyntax> = {
  en: { sep: ',', decimal: '.', arrayCol: ',', arrayRow: ';' },
  fr: { sep: ';', decimal: ',', arrayCol: '.', arrayRow: ';' },
};

/**
 * Syntaxe des formules d'un Google Sheet, d'après la langue du classeur
 * (`fr_FR`, `en_US`…) : là où la virgule est décimale, les arguments se
 * séparent par « ; » et les colonnes d'une matrice par « \ ». Les noms de
 * fonctions restent anglais.
 */
export function sheetSyntax(locale: string | undefined): FormulaSyntax {
  let decimal = '.';
  try {
    const parts = new Intl.NumberFormat((locale ?? 'en-US').replace('_', '-')).formatToParts(1.5);
    decimal = parts.find((p) => p.type === 'decimal')?.value ?? '.';
  } catch {
    // Langue inconnue : syntaxe anglaise.
  }
  return decimal === ','
    ? { sep: ';', decimal: ',', arrayCol: '\\', arrayRow: ';' }
    : FORMULA_SYNTAX.en;
}

export const BOOLEANS: Record<FormulaLocale, [string, string]> = {
  en: ['TRUE', 'FALSE'],
  fr: ['VRAI', 'FAUX'],
};

/** Valeurs d'erreur, dans le même ordre pour chaque langue. */
export const ERROR_VALUES: Record<FormulaLocale, string[]> = {
  en: ['#NULL!', '#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#NUM!', '#N/A', '#SPILL!', '#CALC!'],
  fr: [
    '#NUL!',
    '#DIV/0!',
    '#VALEUR!',
    '#REF!',
    '#NOM?',
    '#NOMBRE!',
    '#N/A',
    '#PROPAGATION!',
    '#CALC!',
  ],
};

const LETTER = String.raw`A-Za-z_À-ɏ`;
const WORD = String.raw`\w.À-ɏ`;
const SHEET = String.raw`'(?:[^']|'')+'!|(?:\[\d+\])?[${LETTER}][${WORD}]*(?::[${LETTER}][${WORD}]*)?!`;
const CELL = String.raw`\$?[A-Za-z]{1,3}\$?\d+`;
// « A2:B » : plage ouverte vers le bas, courante dans Google Sheets.
const OPEN = String.raw`${CELL}:\$?[A-Za-z]{1,3}`;
const AREA = String.raw`${OPEN}|${CELL}(?::${CELL})?|\$?[A-Za-z]{1,3}:\$?[A-Za-z]{1,3}|\$?\d+:\$?\d+`;
const REF = new RegExp(String.raw`(${SHEET})?(${AREA})(?![${WORD}(\[!])`, 'y');
const IDENT = new RegExp(String.raw`[${LETTER}\\][${WORD}]*`, 'y');
const STRING = /"(?:[^"]|"")*"?/y;
const ERROR =
  /#(?:NULL!|NUL!|DIV\/0!|VALUE!|VALEUR!|REF!|NAME\?|NOM\?|NUM!|NOMBRE!|N\/A|SPILL!|PROPAGATION!|CALC!)/iy;
const SPACE = /\s+/y;
const NUMBER: Record<string, RegExp> = {
  '.': /(?:\d+(?:\.\d*)?|\.\d+)(?:E[+-]?\d+)?/iy,
  ',': /(?:\d+(?:,\d*)?|,\d+)(?:E[+-]?\d+)?/iy,
};
const OPERATORS = ['<>', '<=', '>=', '+', '-', '*', '/', '^', '&', '=', '<', '>', '%'];

/** Rectangle d'une zone (« B2:B10 », « A:C », « 3:5 », « A2:B ») ; `null` si hors bornes. */
export function areaRect(area: string): Rect | null {
  const plain = area.replaceAll('$', '').toUpperCase();
  const open = /^([A-Z]{1,3})(\d+):([A-Z]{1,3})$/.exec(plain);
  if (open) {
    const [a, b, top] = [columnNumber(open[1]!), columnNumber(open[3]!), Number(open[2])];
    if (a > MAX_COLUMN || b > MAX_COLUMN || top < 1 || top > MAX_ROW) return null;
    return { top, bottom: MAX_ROW, left: Math.min(a, b), right: Math.max(a, b) };
  }
  const columns = /^([A-Z]{1,3}):([A-Z]{1,3})$/.exec(plain);
  if (columns) {
    const [a, b] = [columnNumber(columns[1]!), columnNumber(columns[2]!)];
    if (a > MAX_COLUMN || b > MAX_COLUMN) return null;
    return { top: 1, bottom: MAX_ROW, left: Math.min(a, b), right: Math.max(a, b) };
  }
  const rows = /^(\d+):(\d+)$/.exec(plain);
  if (rows) {
    const [a, b] = [Number(rows[1]), Number(rows[2])];
    if (a < 1 || b < 1 || a > MAX_ROW || b > MAX_ROW) return null;
    return { top: Math.min(a, b), bottom: Math.max(a, b), left: 1, right: MAX_COLUMN };
  }
  return parseRangeRef(plain);
}

function sheetOf(prefix: string): { sheet: string; external: boolean } {
  const body = prefix.slice(0, -1);
  const name = body.startsWith("'") ? body.slice(1, -1).replaceAll("''", "'") : body;
  return { sheet: name, external: name.startsWith('[') };
}

function match(re: RegExp, formula: string, at: number): RegExpExecArray | null {
  re.lastIndex = at;
  return re.exec(formula);
}

/** `locale` : une langue d'Excel, ou la syntaxe d'un Google Sheet (noms et booléens anglais). */
export function tokenize(formula: string, locale: FormulaLocale | FormulaSyntax): Token[] {
  const syntax = typeof locale === 'string' ? FORMULA_SYNTAX[locale] : locale;
  const booleans = BOOLEANS[locale === 'fr' ? 'fr' : 'en'];
  const number = NUMBER[syntax.decimal]!;
  const tokens: Token[] = [];
  let arrayDepth = 0;
  let i = 0;
  const push = (type: TokenType, text: string, extra?: Partial<Token>) => {
    tokens.push({ type, text, start: i, end: i + text.length, ...extra });
    i += text.length;
  };

  while (i < formula.length) {
    const c = formula[i]!;
    let m: RegExpExecArray | null;
    if ((m = match(SPACE, formula, i))) push('space', m[0]);
    else if (c === '"') push('string', match(STRING, formula, i)![0]);
    else if ((m = match(ERROR, formula, i))) push('error', m[0]);
    else if (c === '{') {
      arrayDepth++;
      push('arrayOpen', c);
    } else if (c === '}') {
      arrayDepth = Math.max(0, arrayDepth - 1);
      push('arrayClose', c);
    } else if (arrayDepth > 0 && c === syntax.arrayRow) push('arrayRow', c);
    // Le séparateur de colonnes d'un tableau n'est jamais la virgule décimale.
    else if (arrayDepth > 0 && c === syntax.arrayCol) push('arrayCol', c);
    else if ((m = match(REF, formula, i)) && areaRect(m[2]!)) {
      const { sheet, external } = m[1] ? sheetOf(m[1]) : { sheet: null, external: false };
      push('ref', m[0], { ref: { sheet, area: m[2]!, rect: areaRect(m[2]!), external } });
    } else if ((m = match(number, formula, i))) push('number', m[0]);
    else if (c === '(') push('open', c);
    else if (c === ')') push('close', c);
    else if (c === syntax.sep) push('sep', c);
    else if ((m = match(IDENT, formula, i))) {
      let text = m[0];
      // Référence structurée d'un tableau : Ventes[Montant].
      if (formula[i + text.length] === '[') {
        const close = formula.indexOf(']', i + text.length);
        text = formula.slice(i, close < 0 ? formula.length : close + 1);
      }
      const next = formula.slice(i + text.length).match(/^\s*(.)/)?.[1];
      const upper = text.toUpperCase();
      if (next === '(' && !text.includes('[')) push('func', text);
      else if (booleans.includes(upper)) push('bool', text);
      else push('name', text);
    } else {
      const op = OPERATORS.find((o) => formula.startsWith(o, i));
      push(op ? 'op' : 'unknown', op ?? c);
    }
  }
  return tokens;
}
