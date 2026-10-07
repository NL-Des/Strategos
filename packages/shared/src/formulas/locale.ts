import { STORED_PREFIXES, functionByFrName, functionByStoredName } from './functions.js';
import {
  BOOLEANS,
  ERROR_VALUES,
  FORMULA_SYNTAX,
  type FormulaLocale,
  type FormulaSyntax,
  type Token,
  tokenize,
} from './tokenize.js';

/**
 * Formules de la grille (04 — Sources) : stockées dans la syntaxe du fichier
 * (`SUM(A1,1.5)`), affichées et saisies comme dans Excel en français
 * (`SOMME(A1;1,5)`). Chaînes et noms de feuilles restent intacts ; une
 * fonction absente du catalogue garde son nom.
 */
interface Dialect {
  syntax: FormulaSyntax;
  /** Langue des noms de fonctions, des booléens et des valeurs d'erreur. */
  lang: FormulaLocale;
  /** Les fonctions récentes portent leur préfixe (`_xlfn.`) : fichier Excel seulement. */
  prefixes: boolean;
}

const FILE: Dialect = { syntax: FORMULA_SYNTAX.en, lang: 'en', prefixes: true };
const FRENCH: Dialect = { syntax: FORMULA_SYNTAX.fr, lang: 'fr', prefixes: false };
const sheet = (syntax: FormulaSyntax): Dialect => ({ syntax, lang: 'en', prefixes: false });

function convert(formula: string, from: Dialect, to: Dialect): string {
  const [src, dst] = [from.syntax, to.syntax];
  const map = (t: Token): string => {
    switch (t.type) {
      case 'func': {
        const f = from.lang === 'en' ? functionByStoredName(t.text) : functionByFrName(t.text);
        if (!f) return to.prefixes ? t.text : t.text.replace(STORED_PREFIXES, '');
        return to.lang === 'en' ? `${to.prefixes ? (f.prefix ?? '') : ''}${f.en}` : f.fr;
      }
      case 'number':
        return t.text.replace(src.decimal, dst.decimal);
      case 'sep':
        return dst.sep;
      case 'arrayCol':
        return dst.arrayCol;
      case 'arrayRow':
        return dst.arrayRow;
      case 'bool':
        return BOOLEANS[to.lang][BOOLEANS[from.lang].indexOf(t.text.toUpperCase())] ?? t.text;
      case 'error': {
        const i = ERROR_VALUES[from.lang].indexOf(t.text.toUpperCase());
        return i < 0 ? t.text : ERROR_VALUES[to.lang][i]!;
      }
      case 'ref': {
        if (to.lang !== 'en') return t.text;
        // Excel écrit les références en majuscules dans le fichier.
        return t.text.slice(0, t.text.length - t.ref!.area.length) + t.ref!.area.toUpperCase();
      }
      default:
        return t.text;
    }
  };
  return tokenize(formula, from.lang === 'fr' ? 'fr' : from.syntax)
    .map(map)
    .join('');
}

/** Formule du fichier (sans « = ») → saisie en français. */
export const formulaToFr = (stored: string) => convert(stored, FILE, FRENCH);

/** Saisie en français (sans « = ») → formule du fichier. */
export const formulaFromFr = (input: string) => convert(input, FRENCH, FILE);

/**
 * Formule lue dans un Google Sheet (sans « = », séparateurs de la langue du
 * classeur) → syntaxe du fichier, sans préfixe.
 */
export const formulaFromSheet = (read: string, syntax: FormulaSyntax) =>
  convert(read, sheet(syntax), sheet(FORMULA_SYNTAX.en));

/** Syntaxe du fichier (sans « = ») → formule à écrire dans un Google Sheet, sans préfixe. */
export const formulaToSheet = (stored: string, syntax: FormulaSyntax) =>
  convert(stored, FILE, sheet(syntax));
