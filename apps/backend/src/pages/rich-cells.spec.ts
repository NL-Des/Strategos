import { sanitizeRichHtml } from '../common/html-sanitizer.js';
import { replaceRichCells, richCells } from './rich-cells.js';

const SOURCE = '0190f5c0-0000-7000-8000-000000000001';
const span = (sheet: string, ref: string, format = 'number') =>
  `<span data-cell-format="${format}" data-cell-ref="${ref}" data-cell-sheet="${sheet}" data-cell-source="${SOURCE}">x</span>`;

describe('valeurs insérées dans un Contenu libre', () => {
  it('forme canonique à l’enregistrement ; retirées des notes', () => {
    const html = sanitizeRichHtml(`<p>Or : ${span('Stock &amp; co', '$b$2')}</p>`, {
      cellValues: true,
    });
    expect(html).toBe(
      `<p>Or : <span data-cell-source="${SOURCE}" data-cell-sheet="Stock &amp; co" data-cell-ref="B2" data-cell-format="number">{Stock &amp; co!B2}</span></p>`,
    );
    expect(sanitizeRichHtml(`<p>${span('Stock', 'B2')}</p>`)).toBe('<p>x</p>');
  });

  it('span invalide retiré, texte gardé', () => {
    expect(sanitizeRichHtml('<p><span data-cell-ref="B2">z</span></p>', { cellValues: true })).toBe(
      '<p>z</p>',
    );
  });

  it('lues puis remplacées sans source, feuille ni cellule', () => {
    const html = sanitizeRichHtml(`<p>${span('Stock', 'B2')} et ${span('Or', 'C3', 'text')}</p>`, {
      cellValues: true,
    });
    expect(richCells(html)).toEqual([
      { sourceId: SOURCE, sheet: 'Stock', row: 2, col: 2, format: 'number' },
      { sourceId: SOURCE, sheet: 'Or', row: 3, col: 3, format: 'text' },
    ]);
    expect(replaceRichCells(html)).toBe(
      '<p><span data-value="0"></span> et <span data-value="1"></span></p>',
    );
  });
});
