import { MAX_COLUMN, MAX_ROW } from '@strategos/shared';
import { describe, expect, it } from 'vitest';
import { formulaRefs, rectContains } from './formula-deps.js';

describe('formulaRefs', () => {
  it('trouve les cellules et plages de la feuille courante', () => {
    expect(formulaRefs('=B2*C2+SUM($D$1:D10)', 'Stock')).toEqual([
      { sheet: 'Stock', rect: { top: 2, bottom: 2, left: 2, right: 2 } },
      { sheet: 'Stock', rect: { top: 2, bottom: 2, left: 3, right: 3 } },
      { sheet: 'Stock', rect: { top: 1, bottom: 10, left: 4, right: 4 } },
    ]);
  });

  it('suit les autres feuilles, avec ou sans guillemets', () => {
    expect(formulaRefs("=Prix!A1+'Mes prix'!B3", 'Stock')).toEqual([
      { sheet: 'Prix', rect: { top: 1, bottom: 1, left: 1, right: 1 } },
      { sheet: 'Mes prix', rect: { top: 3, bottom: 3, left: 2, right: 2 } },
    ]);
  });

  it('comprend les colonnes et lignes entières', () => {
    expect(formulaRefs('=SUM(A:B)+SUM(3:4)', 'S')).toEqual([
      { sheet: 'S', rect: { top: 1, bottom: MAX_ROW, left: 1, right: 2 } },
      { sheet: 'S', rect: { top: 3, bottom: 4, left: 1, right: MAX_COLUMN } },
    ]);
  });

  it('ignore les fonctions, les chaînes et les autres classeurs', () => {
    expect(formulaRefs('=LOG10(A1)&"B2"', 'S')).toEqual([
      { sheet: 'S', rect: { top: 1, bottom: 1, left: 1, right: 1 } },
    ]);
    expect(formulaRefs("=[1]Stock!B2+'[2]Autre feuille'!C3", 'S')).toEqual([]);
  });

  it('rectContains', () => {
    expect(rectContains({ top: 1, bottom: 3, left: 2, right: 2 }, 3, 2)).toBe(true);
    expect(rectContains({ top: 1, bottom: 3, left: 2, right: 2 }, 4, 2)).toBe(false);
  });
});
