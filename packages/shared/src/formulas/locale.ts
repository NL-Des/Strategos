import { functionByFrName, functionByStoredName } from './functions.js';
import {
  BOOLEANS,
  ERROR_VALUES,
  FORMULA_SYNTAX,
  type FormulaLocale,
  type Token,
  tokenize,
} from './tokenize.js';

/**
 * Formules de la grille (04 — Sources) : stockées dans la syntaxe du fichier
 * (`SUM(A1,1.5)`), affichées et saisies comme dans Excel en français
 * (`SOMME(A1;1,5)`). Chaînes et noms de feuilles restent intacts ; une
 * fonction absente du catalogue garde son nom.
 */
function convert(formula: string, from: FormulaLocale, to: FormulaLocale): string {
  const [src, dst] = [FORMULA_SYNTAX[from], FORMULA_SYNTAX[to]];
  const map = (t: Token): string => {
    switch (t.type) {
      case 'func': {
        const f = from === 'en' ? functionByStoredName(t.text) : functionByFrName(t.text);
        if (!f) return t.text;
        return to === 'en' ? `${f.prefix ?? ''}${f.en}` : f.fr;
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
        return BOOLEANS[to][BOOLEANS[from].indexOf(t.text.toUpperCase())] ?? t.text;
      case 'error': {
        const i = ERROR_VALUES[from].indexOf(t.text.toUpperCase());
        return i < 0 ? t.text : ERROR_VALUES[to][i]!;
      }
      case 'ref': {
        if (to !== 'en') return t.text;
        // Excel écrit les références en majuscules dans le fichier.
        return t.text.slice(0, t.text.length - t.ref!.area.length) + t.ref!.area.toUpperCase();
      }
      default:
        return t.text;
    }
  };
  return tokenize(formula, from).map(map).join('');
}

/** Formule du fichier (sans « = ») → saisie en français. */
export const formulaToFr = (stored: string) => convert(stored, 'en', 'fr');

/** Saisie en français (sans « = ») → formule du fichier. */
export const formulaFromFr = (input: string) => convert(input, 'fr', 'en');
