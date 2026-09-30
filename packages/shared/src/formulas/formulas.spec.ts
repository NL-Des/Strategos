import { describe, expect, it } from 'vitest';
import { FORMULA_FUNCTIONS, argumentAt, functionByStoredName } from './functions.js';
import { formulaFromFr, formulaToFr } from './locale.js';
import { type FormulaNode, callAt, expectsOperand, parseFormula } from './parse.js';
import { tokenize } from './tokenize.js';

const types = (formula: string, locale: 'en' | 'fr' = 'en') =>
  tokenize(formula, locale)
    .filter((t) => t.type !== 'space')
    .map((t) => `${t.type}:${t.text}`);

/** Arbre compact, pour comparer : `SUM(A1,+(B2,C3))`. */
function show(n: FormulaNode): string {
  switch (n.kind) {
    case 'call':
      return `${n.name}(${n.args.map(show).join(',')})`;
    case 'binary':
      return `${n.op}(${show(n.left)},${show(n.right)})`;
    case 'unary':
      return `neg(${show(n.operand)})`;
    case 'percent':
      return `%(${show(n.operand)})`;
    case 'group':
      return `(${show(n.inner)})`;
    case 'empty':
      return '∅';
    case 'missing':
      return '?';
    default:
      return n.text;
  }
}

describe('tokenize', () => {
  it('références, fonctions, noms, chaînes', () => {
    expect(types('SUM(A1:B2,\'Mes ventes\'!$C$3)*Taux&"a,b"')).toEqual([
      'func:SUM',
      'open:(',
      'ref:A1:B2',
      'sep:,',
      "ref:'Mes ventes'!$C$3",
      'close:)',
      'op:*',
      'name:Taux',
      'op:&',
      'string:"a,b"',
    ]);
  });

  it('distingue LOG10( d’une référence, et lit colonnes et lignes entières', () => {
    expect(types('LOG10(A:A)+SUM(3:5)')).toEqual([
      'func:LOG10',
      'open:(',
      'ref:A:A',
      'close:)',
      'op:+',
      'func:SUM',
      'open:(',
      'ref:3:5',
      'close:)',
    ]);
  });

  it('feuille, autre classeur et zone de la référence', () => {
    const [local, other, external] = tokenize("Stock!B2+'L''an'!C1+[1]Stock!D4", 'en').filter(
      (t) => t.type === 'ref',
    );
    expect(local!.ref).toMatchObject({ sheet: 'Stock', area: 'B2', external: false });
    expect(other!.ref).toMatchObject({ sheet: "L'an", area: 'C1' });
    expect(external!.ref).toMatchObject({ external: true, area: 'D4' });
    expect(local!.ref!.rect).toEqual({ top: 2, bottom: 2, left: 2, right: 2 });
  });

  it('nombres et séparateurs selon la langue', () => {
    expect(types('ROUND(1.5,2)')).toEqual([
      'func:ROUND',
      'open:(',
      'number:1.5',
      'sep:,',
      'number:2',
      'close:)',
    ]);
    expect(types('ARRONDI(1,5;2)', 'fr')).toEqual([
      'func:ARRONDI',
      'open:(',
      'number:1,5',
      'sep:;',
      'number:2',
      'close:)',
    ]);
  });

  it('formule incomplète : des jetons, pas d’erreur', () => {
    expect(types('SUM(A1,"ab')).toEqual(['func:SUM', 'open:(', 'ref:A1', 'sep:,', 'string:"ab']);
  });
});

describe('parseFormula', () => {
  it('priorités d’Excel', () => {
    expect(show(parseFormula('A1+B2*C3^2', 'en').root)).toBe('+(A1,*(B2,^(C3,2)))');
    expect(show(parseFormula('-2^2', 'en').root)).toBe('^(neg(2),2)');
    expect(show(parseFormula('A1&"x"=B1', 'en').root)).toBe('=(&(A1,"x"),B1)');
    expect(show(parseFormula('(A1+1)*50%', 'en').root)).toBe('*((+(A1,1)),%(50))');
  });

  it('fonctions imbriquées et arguments vides', () => {
    const parsed = parseFormula('SI(ET(A1>0;B1);;"non")', 'fr');
    expect(show(parsed.root)).toBe('SI(ET(>(A1,0),B1),∅,"non")');
    expect(parsed.errors).toEqual([]);
    expect(parsed.root).toMatchObject({ kind: 'call', fn: { en: 'IF' } });
  });

  it('saisie en cours : arbre partiel et erreurs', () => {
    const parsed = parseFormula('SOMME(A1;', 'fr');
    expect(show(parsed.root)).toBe('SOMME(A1,∅)');
    expect(parsed.errors.map((e) => e.error)).toContain('unclosed');
    expect(show(parseFormula('A1*', 'en').root)).toBe('*(A1,?)');
    expect(parseFormula('A1)', 'en').errors).toEqual([{ error: 'unexpected', at: 2 }]);
  });
});

describe('callAt et expectsOperand', () => {
  const tokens = tokenize('SI(A1>0;RECHERCHEV(B2;C:D;2);0)', 'fr');

  it('argument sous le curseur', () => {
    expect(callAt(tokens, 3, 'fr')).toMatchObject({ name: 'SI', argIndex: 0 });
    expect(callAt(tokens, 23, 'fr')).toMatchObject({ name: 'RECHERCHEV', argIndex: 1 });
    expect(callAt(tokens, 29, 'fr')).toMatchObject({ name: 'SI', argIndex: 2 });
    expect(callAt(tokens, 0, 'fr')).toBeNull();
  });

  it('attend une référence après « ( », « ; » ou un opérateur', () => {
    const t = tokenize('SOMME(A1;', 'fr');
    expect(expectsOperand(t, 9)).toBe(true);
    expect(expectsOperand(t, 6)).toBe(true);
    expect(expectsOperand(t, 8)).toBe(false);
    expect(expectsOperand(t, 7)).toBe(false);
    expect(expectsOperand([], 0)).toBe(true);
  });
});

describe('formulaToFr et formulaFromFr', () => {
  const pairs: [string, string][] = [
    ['SUM(B2:B10,C1)', 'SOMME(B2:B10;C1)'],
    ['IF(A1>=1.5,"a,b;c",FALSE)', 'SI(A1>=1,5;"a,b;c";FAUX)'],
    ['SUMIFS(\'Mes ventes\'!C:C,Stock!A:A,"x")', 'SOMME.SI.ENS(\'Mes ventes\'!C:C;Stock!A:A;"x")'],
    ['_xlfn.XLOOKUP(A1,B:B,C:C,#N/A)', 'RECHERCHEX(A1;B:B;C:C;#N/A)'],
    ['_xlfn._xlws.FILTER(A1:B9,A1:A9>0)', 'FILTRE(A1:B9;A1:A9>0)'],
    ['IFERROR(1/0,#DIV/0!)&#VALUE!', 'SIERREUR(1/0;#DIV/0!)&#VALEUR!'],
    ['SUM({1,2.5;3,4})', 'SOMME({1.2,5;3.4})'],
    ['[1]Stock!B2*2', '[1]Stock!B2*2'],
    ['MYUDF(A1,2)', 'MYUDF(A1;2)'],
  ];

  it.each(pairs)('%s ↔ %s', (stored, fr) => {
    expect(formulaToFr(stored)).toBe(fr);
    expect(formulaFromFr(fr)).toBe(stored);
  });

  it('accepte les minuscules à la saisie', () => {
    expect(formulaFromFr('somme(b2:b3;vrai)')).toBe('SUM(B2:B3,TRUE)');
  });
});

describe('catalogue', () => {
  it('noms uniques', () => {
    expect(new Set(FORMULA_FUNCTIONS.map((f) => f.en)).size).toBe(FORMULA_FUNCTIONS.length);
    expect(new Set(FORMULA_FUNCTIONS.map((f) => f.fr)).size).toBe(FORMULA_FUNCTIONS.length);
  });

  it('arguments répétés', () => {
    const sumifs = functionByStoredName('SUMIFS')!;
    expect([0, 1, 2, 3, 4].map((i) => argumentAt(sumifs, i)?.key)).toEqual([
      'sumRange',
      'criteriaRange',
      'criteria',
      'criteriaRange',
      'criteria',
    ]);
    expect(argumentAt(functionByStoredName('IF')!, 3)).toBeUndefined();
  });
});
