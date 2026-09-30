/**
 * Fonctions courantes d'Excel, pour l'assistant de formules de la grille
 * (04 — Sources) : nom dans le fichier (`en`), nom dans Excel en français
 * (`fr`), arguments. Les descriptions sont des textes d'interface
 * (`formulas.*` dans les traductions). Une fonction absente du catalogue
 * reste utilisable : elle est écrite telle quelle.
 */
export const FORMULA_CATEGORIES = [
  'math',
  'stats',
  'logic',
  'text',
  'date',
  'lookup',
  'info',
] as const;
export type FormulaCategory = (typeof FORMULA_CATEGORIES)[number];

export const FORMULA_ARGS = [
  'number',
  'digits',
  'divisor',
  'power',
  'range',
  'criteria',
  'sumRange',
  'criteriaRange',
  'averageRange',
  'maxRange',
  'minRange',
  'array',
  'k',
  'bottom',
  'top',
  'value',
  'logicalTest',
  'valueIfTrue',
  'valueIfFalse',
  'logical',
  'valueIfError',
  'valueIfNa',
  'expression',
  'result',
  'text',
  'delimiter',
  'ignoreEmpty',
  'numChars',
  'start',
  'oldText',
  'newText',
  'instance',
  'findText',
  'withinText',
  'format',
  'times',
  'year',
  'month',
  'day',
  'date',
  'returnType',
  'startDate',
  'endDate',
  'months',
  'unit',
  'holidays',
  'days',
  'time',
  'lookupValue',
  'tableArray',
  'colIndex',
  'rowIndex',
  'rangeLookup',
  'lookupArray',
  'returnArray',
  'ifNotFound',
  'matchMode',
  'searchMode',
  'rowNum',
  'colNum',
  'matchType',
  'indexNum',
  'reference',
  'rows',
  'cols',
  'height',
  'width',
  'refText',
  'include',
  'ifEmpty',
  'sortIndex',
  'sortOrder',
  'byCol',
  'exactlyOnce',
] as const;
export type FormulaArg = (typeof FORMULA_ARGS)[number];

export interface FormulaArgSpec {
  key: FormulaArg;
  optional?: boolean;
}

export interface FormulaFunction {
  en: string;
  fr: string;
  category: FormulaCategory;
  args: FormulaArgSpec[];
  /** Nombre de derniers arguments qui peuvent se répéter (SOMME.SI.ENS : 2). */
  repeat?: number;
  /** Préfixe dans le fichier des fonctions récentes (`_xlfn.`). */
  prefix?: string;
}

type ArgList = (FormulaArg | `${FormulaArg}?`)[];

const XLFN = '_xlfn.';
const XLWS = '_xlfn._xlws.';

function fn(
  en: string,
  fr: string,
  category: FormulaCategory,
  args: ArgList,
  extra: { repeat?: number; prefix?: string } = {},
): FormulaFunction {
  return {
    en,
    fr,
    category,
    args: args.map((a) =>
      a.endsWith('?')
        ? { key: a.slice(0, -1) as FormulaArg, optional: true }
        : { key: a as FormulaArg },
    ),
    ...extra,
  };
}

export const FORMULA_FUNCTIONS: FormulaFunction[] = [
  // Maths
  fn('SUM', 'SOMME', 'math', ['number'], { repeat: 1 }),
  fn('SUMIF', 'SOMME.SI', 'math', ['range', 'criteria', 'sumRange?']),
  fn('SUMIFS', 'SOMME.SI.ENS', 'math', ['sumRange', 'criteriaRange', 'criteria'], { repeat: 2 }),
  fn('SUMPRODUCT', 'SOMMEPROD', 'math', ['array'], { repeat: 1 }),
  fn('PRODUCT', 'PRODUIT', 'math', ['number'], { repeat: 1 }),
  fn('ROUND', 'ARRONDI', 'math', ['number', 'digits']),
  fn('ROUNDUP', 'ARRONDI.SUP', 'math', ['number', 'digits']),
  fn('ROUNDDOWN', 'ARRONDI.INF', 'math', ['number', 'digits']),
  fn('INT', 'ENT', 'math', ['number']),
  fn('ABS', 'ABS', 'math', ['number']),
  fn('MOD', 'MOD', 'math', ['number', 'divisor']),
  fn('POWER', 'PUISSANCE', 'math', ['number', 'power']),
  fn('SQRT', 'RACINE', 'math', ['number']),
  fn('RAND', 'ALEA', 'math', []),
  fn('RANDBETWEEN', 'ALEA.ENTRE.BORNES', 'math', ['bottom', 'top']),
  // Statistiques
  fn('AVERAGE', 'MOYENNE', 'stats', ['number'], { repeat: 1 }),
  fn('AVERAGEIF', 'MOYENNE.SI', 'stats', ['range', 'criteria', 'averageRange?']),
  fn('AVERAGEIFS', 'MOYENNE.SI.ENS', 'stats', ['averageRange', 'criteriaRange', 'criteria'], {
    repeat: 2,
  }),
  fn('COUNT', 'NB', 'stats', ['value'], { repeat: 1 }),
  fn('COUNTA', 'NBVAL', 'stats', ['value'], { repeat: 1 }),
  fn('COUNTBLANK', 'NB.VIDE', 'stats', ['range']),
  fn('COUNTIF', 'NB.SI', 'stats', ['range', 'criteria']),
  fn('COUNTIFS', 'NB.SI.ENS', 'stats', ['criteriaRange', 'criteria'], { repeat: 2 }),
  fn('MAX', 'MAX', 'stats', ['number'], { repeat: 1 }),
  fn('MIN', 'MIN', 'stats', ['number'], { repeat: 1 }),
  fn('MAXIFS', 'MAX.SI.ENS', 'stats', ['maxRange', 'criteriaRange', 'criteria'], {
    repeat: 2,
    prefix: XLFN,
  }),
  fn('MINIFS', 'MIN.SI.ENS', 'stats', ['minRange', 'criteriaRange', 'criteria'], {
    repeat: 2,
    prefix: XLFN,
  }),
  fn('MEDIAN', 'MEDIANE', 'stats', ['number'], { repeat: 1 }),
  fn('LARGE', 'GRANDE.VALEUR', 'stats', ['array', 'k']),
  fn('SMALL', 'PETITE.VALEUR', 'stats', ['array', 'k']),
  // Logique
  fn('IF', 'SI', 'logic', ['logicalTest', 'valueIfTrue', 'valueIfFalse?']),
  fn('IFS', 'SI.CONDITIONS', 'logic', ['logicalTest', 'valueIfTrue'], { repeat: 2, prefix: XLFN }),
  fn('AND', 'ET', 'logic', ['logical'], { repeat: 1 }),
  fn('OR', 'OU', 'logic', ['logical'], { repeat: 1 }),
  fn('XOR', 'OUX', 'logic', ['logical'], { repeat: 1, prefix: XLFN }),
  fn('NOT', 'NON', 'logic', ['logical']),
  fn('IFERROR', 'SIERREUR', 'logic', ['value', 'valueIfError']),
  fn('IFNA', 'SI.NON.DISP', 'logic', ['value', 'valueIfNa'], { prefix: XLFN }),
  fn('SWITCH', 'SI.MULTIPLE', 'logic', ['expression', 'value', 'result'], {
    repeat: 2,
    prefix: XLFN,
  }),
  // Texte
  fn('CONCATENATE', 'CONCATENER', 'text', ['text'], { repeat: 1 }),
  fn('CONCAT', 'CONCAT', 'text', ['text'], { repeat: 1, prefix: XLFN }),
  fn('TEXTJOIN', 'JOINDRE.TEXTE', 'text', ['delimiter', 'ignoreEmpty', 'text'], {
    repeat: 1,
    prefix: XLFN,
  }),
  fn('LEFT', 'GAUCHE', 'text', ['text', 'numChars?']),
  fn('RIGHT', 'DROITE', 'text', ['text', 'numChars?']),
  fn('MID', 'STXT', 'text', ['text', 'start', 'numChars']),
  fn('LEN', 'NBCAR', 'text', ['text']),
  fn('LOWER', 'MINUSCULE', 'text', ['text']),
  fn('UPPER', 'MAJUSCULE', 'text', ['text']),
  fn('PROPER', 'NOMPROPRE', 'text', ['text']),
  fn('TRIM', 'SUPPRESPACE', 'text', ['text']),
  fn('SUBSTITUTE', 'SUBSTITUE', 'text', ['text', 'oldText', 'newText', 'instance?']),
  fn('FIND', 'TROUVE', 'text', ['findText', 'withinText', 'start?']),
  fn('SEARCH', 'CHERCHE', 'text', ['findText', 'withinText', 'start?']),
  fn('TEXT', 'TEXTE', 'text', ['value', 'format']),
  fn('VALUE', 'CNUM', 'text', ['text']),
  fn('REPT', 'REPT', 'text', ['text', 'times']),
  fn('EXACT', 'EXACT', 'text', ['text', 'text']),
  // Dates
  fn('TODAY', 'AUJOURDHUI', 'date', []),
  fn('NOW', 'MAINTENANT', 'date', []),
  fn('DATE', 'DATE', 'date', ['year', 'month', 'day']),
  fn('YEAR', 'ANNEE', 'date', ['date']),
  fn('MONTH', 'MOIS', 'date', ['date']),
  fn('DAY', 'JOUR', 'date', ['date']),
  fn('WEEKDAY', 'JOURSEM', 'date', ['date', 'returnType?']),
  fn('EDATE', 'MOIS.DECALER', 'date', ['startDate', 'months']),
  fn('EOMONTH', 'FIN.MOIS', 'date', ['startDate', 'months']),
  fn('DATEDIF', 'DATEDIF', 'date', ['startDate', 'endDate', 'unit']),
  fn('NETWORKDAYS', 'NB.JOURS.OUVRES', 'date', ['startDate', 'endDate', 'holidays?']),
  fn('WORKDAY', 'SERIE.JOUR.OUVRE', 'date', ['startDate', 'days', 'holidays?']),
  fn('HOUR', 'HEURE', 'date', ['time']),
  fn('MINUTE', 'MINUTE', 'date', ['time']),
  // Recherche
  fn('VLOOKUP', 'RECHERCHEV', 'lookup', ['lookupValue', 'tableArray', 'colIndex', 'rangeLookup?']),
  fn('HLOOKUP', 'RECHERCHEH', 'lookup', ['lookupValue', 'tableArray', 'rowIndex', 'rangeLookup?']),
  fn(
    'XLOOKUP',
    'RECHERCHEX',
    'lookup',
    ['lookupValue', 'lookupArray', 'returnArray', 'ifNotFound?', 'matchMode?', 'searchMode?'],
    { prefix: XLFN },
  ),
  fn('INDEX', 'INDEX', 'lookup', ['array', 'rowNum', 'colNum?']),
  fn('MATCH', 'EQUIV', 'lookup', ['lookupValue', 'lookupArray', 'matchType?']),
  fn('XMATCH', 'EQUIVX', 'lookup', ['lookupValue', 'lookupArray', 'matchMode?', 'searchMode?'], {
    prefix: XLFN,
  }),
  fn('CHOOSE', 'CHOISIR', 'lookup', ['indexNum', 'value'], { repeat: 1 }),
  fn('OFFSET', 'DECALER', 'lookup', ['reference', 'rows', 'cols', 'height?', 'width?']),
  fn('INDIRECT', 'INDIRECT', 'lookup', ['refText']),
  fn('ROW', 'LIGNE', 'lookup', ['reference?']),
  fn('COLUMN', 'COLONNE', 'lookup', ['reference?']),
  fn('ROWS', 'LIGNES', 'lookup', ['array']),
  fn('COLUMNS', 'COLONNES', 'lookup', ['array']),
  fn('FILTER', 'FILTRE', 'lookup', ['array', 'include', 'ifEmpty?'], { prefix: XLWS }),
  fn('SORT', 'TRIER', 'lookup', ['array', 'sortIndex?', 'sortOrder?', 'byCol?'], {
    prefix: XLWS,
  }),
  fn('UNIQUE', 'UNIQUE', 'lookup', ['array', 'byCol?', 'exactlyOnce?'], { prefix: XLFN }),
  // Informations
  fn('ISBLANK', 'ESTVIDE', 'info', ['value']),
  fn('ISNUMBER', 'ESTNUM', 'info', ['value']),
  fn('ISTEXT', 'ESTTEXTE', 'info', ['value']),
  fn('ISERROR', 'ESTERREUR', 'info', ['value']),
  fn('ISNA', 'ESTNA', 'info', ['value']),
  fn('NA', 'NA', 'info', []),
];

const BY_EN = new Map(FORMULA_FUNCTIONS.map((f) => [f.en, f]));
const BY_FR = new Map(FORMULA_FUNCTIONS.map((f) => [f.fr, f]));
const PREFIXES = /^(?:_xlfn\.|_xlws\.)+/i;

/** Fonction d'après son nom dans le fichier (préfixe `_xlfn.` compris) ; casse indifférente. */
export function functionByStoredName(name: string): FormulaFunction | undefined {
  return BY_EN.get(name.replace(PREFIXES, '').toUpperCase());
}

/** Fonction d'après son nom dans Excel en français ; casse indifférente. */
export function functionByFrName(name: string): FormulaFunction | undefined {
  return BY_FR.get(name.toUpperCase());
}

/** Spécification du `index`-ième argument (à partir de 0), répétitions comprises. */
export function argumentAt(f: FormulaFunction, index: number): FormulaArgSpec | undefined {
  if (index < f.args.length) return f.args[index];
  if (!f.repeat) return undefined;
  const first = f.args.length - f.repeat;
  return f.args[first + ((index - f.args.length) % f.repeat)];
}
