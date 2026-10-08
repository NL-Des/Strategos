import { CellType } from '@strategos/shared';
import { buildXlsx, withExternalLink, withPadding } from '../../test/xlsx.js';
import {
  exceedsUncompressedSize,
  externalRefs,
  parseWorkbook,
  pureExternalRef,
} from './excel-parser.js';

describe('lecture d’un classeur', () => {
  it('garde valeurs et formules, sans rien calculer', async () => {
    const book = await parseWorkbook(
      await buildXlsx({
        Stock: {
          A1: 'Épée',
          B1: 3,
          C1: 4,
          // Valeur stockée volontairement fausse : elle doit être lue telle quelle.
          D1: { formula: 'B1*C1', result: 99 },
          E1: new Date(Date.UTC(2026, 8, 26)),
          F1: true,
          G1: { error: '#N/A' },
        },
        Vide: {},
      }),
    );
    expect(book.sheets.map((s) => s.name)).toEqual(['Stock', 'Vide']);
    const cells = Object.fromEntries(book.sheets[0]!.cells.map((c) => [c.col, c]));
    expect(cells[1]).toMatchObject({ type: CellType.text, text: 'Épée', formula: null });
    expect(cells[4]).toMatchObject({ type: CellType.number, number: 99, formula: 'B1*C1' });
    expect(cells[5]).toMatchObject({ type: CellType.date, text: '2026-09-26', number: 46291 });
    expect(cells[6]).toMatchObject({ type: CellType.bool, number: 1 });
    expect(cells[7]).toMatchObject({ type: CellType.error, text: '#N/A' });
  });

  it('lit le nom des classeurs liés, sans leur chemin', async () => {
    const xlsx = withExternalLink(
      await buildXlsx({ Bilan: { A1: { formula: '[1]Stock!B2', result: 12 } } }),
      'file:///C:/Users/nadia/Documents/stock%20guilde.xlsx',
    );
    const book = await parseWorkbook(xlsx);
    expect([...book.externalBooks]).toEqual([[1, 'stock guilde.xlsx']]);
  });

  it('rejette un fichier qui n’est pas un classeur', async () => {
    await expect(parseWorkbook(Buffer.from('pas un zip'))).rejects.toThrow();
  });
});

describe('références externes', () => {
  it('trouve toutes les références d’une formule', () => {
    expect(externalRefs("[1]Stock!$B$2*2+SUM('[2]Feuille d''or'!A1:A9)")).toEqual([
      { book: 1, sheet: 'Stock', range: 'B2' },
      { book: 2, sheet: "Feuille d'or", range: 'A1:A9' },
    ]);
  });

  it('ne suit que les formules qui ne sont qu’une référence à une cellule', () => {
    expect(pureExternalRef('[1]Stock!B2')).toEqual({ book: 1, sheet: 'Stock', range: 'B2' });
    expect(pureExternalRef("='[1]Stock Or'!$C$4")).toEqual({
      book: 1,
      sheet: 'Stock Or',
      range: 'C4',
    });
    expect(pureExternalRef('[1]Stock!B2*2')).toBeNull();
    expect(pureExternalRef('[1]Stock!B2:B9')).toBeNull();
    expect(pureExternalRef('Stock!B2')).toBeNull();
  });
});

describe('classeur très compressé', () => {
  it('la taille décompressée est mesurée, pas celle du fichier', async () => {
    const MB = 1024 * 1024;
    const bomb = withPadding(await buildXlsx({ Stock: { A1: 'Épée' } }), 8 * MB);
    expect(bomb.length).toBeLessThan(MB / 4);
    expect(exceedsUncompressedSize(bomb, 4 * MB)).toBe(true);
    expect(exceedsUncompressedSize(bomb, 16 * MB)).toBe(false);
  });
});
