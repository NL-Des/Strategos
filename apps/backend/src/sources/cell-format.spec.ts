import { CellType } from '@strategos/shared';
import { formatRowCell, formatText, imageResolver, type StoredCell } from './cell-format.js';
import { headerRow, rangeRect } from './data-range.js';

const num = (n: number, needsRecalc = false): StoredCell => ({
  type: CellType.number,
  text: String(n),
  number: n,
  needsRecalc,
});
const text = (t: string): StoredCell => ({
  type: CellType.text,
  text: t,
  number: null,
  needsRecalc: false,
});
// Espaces fines insécables du format français normalisées pour la comparaison.
const plain = (s: string) => s.replace(/[\u202f\u00a0]/g, ' ');

describe('formatage des cellules', () => {
  it('nombres, monnaie et dates au format français', () => {
    expect(plain(formatText(num(4250.5), 'number'))).toBe('4 250,5');
    expect(plain(formatText(num(12), 'currency'))).toBe('12,00 €');
    expect(formatText({ ...num(46291), type: CellType.date, text: '2026-09-26' }, 'date')).toBe(
      '26/09/2026',
    );
    expect(formatText(text('abc'), 'number')).toBe('abc');
  });

  it('liens web et images : médiathèque, lien, ou image par défaut', () => {
    const resolve = imageResolver(new Map([['epee.png', '/api/v1/media/1']]));
    expect(formatRowCell(text('https://ex.org'), 'link', resolve)).toMatchObject({
      href: 'https://ex.org',
    });
    expect(formatRowCell(text('javascript:x'), 'link', resolve).href).toBeUndefined();
    expect(formatRowCell(text('Epee.PNG'), 'image', resolve).image).toBe('/api/v1/media/1');
    expect(formatRowCell(text('https://ex.org/a.png'), 'image', resolve).image).toBe(
      'https://ex.org/a.png',
    );
    expect(formatRowCell(text('inconnue.png'), 'image', resolve).image).toBeNull();
  });

  it('garde l’indicateur « à recalculer »', () => {
    expect(formatRowCell(num(3, true), 'number', () => null).needsRecalc).toBe(true);
  });
});

describe('plages', () => {
  const ref = { sourceId: 's', sheet: 'Stock', headerRow: true };
  it('fixe ou extensible jusqu’à la dernière ligne remplie', () => {
    expect(rangeRect({ ...ref, range: { mode: 'fixed', ref: 'D11:A1' } }, null)).toEqual({
      top: 1,
      bottom: 11,
      left: 1,
      right: 4,
    });
    const ext = { ...ref, range: { mode: 'extensible' as const, columns: 'B:C', startRow: 3 } };
    expect(rangeRect(ext, 40)).toEqual({ top: 3, bottom: 40, left: 2, right: 3 });
    expect(rangeRect(ext, null)?.bottom).toBe(2);
    expect(headerRow(ext)).toBe(3);
  });
});
