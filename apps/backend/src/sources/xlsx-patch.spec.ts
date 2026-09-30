import { CellType } from '@strategos/shared';
import { strFromU8, unzipSync } from 'fflate';
import { buildXlsx } from '../../test/xlsx.js';
import { parseWorkbook } from './excel-parser.js';
import { patchWorkbook } from './xlsx-patch.js';

const cellsOf = async (buffer: Buffer, sheet = 'Stock') => {
  const book = await parseWorkbook(buffer);
  const found = book.sheets.find((s) => s.name === sheet)!;
  return new Map(found.cells.map((c) => [`${c.row}:${c.col}`, c]));
};

describe('patchWorkbook', () => {
  it('remplace des valeurs, écrase une formule et ajoute une ligne', async () => {
    const original = await buildXlsx({
      Stock: {
        A1: 'Produit',
        B1: 'Qté',
        A2: 'Épée',
        B2: 10,
        C2: { formula: 'B2*2', result: 20 },
      },
      Autre: { A1: 'intact' },
    });
    const patched = patchWorkbook(original, [
      { sheet: 'Stock', row: 2, col: 2, value: { type: CellType.number, text: '8', number: 8 } },
      {
        sheet: 'Stock',
        row: 2,
        col: 3,
        value: { type: CellType.text, text: 'a < b & "c"', number: null },
      },
      {
        sheet: 'Stock',
        row: 3,
        col: 1,
        value: { type: CellType.text, text: 'Bouclier', number: null },
      },
      { sheet: 'Stock', row: 3, col: 2, value: { type: CellType.bool, text: 'VRAI', number: 1 } },
    ]);
    const cells = await cellsOf(patched);
    expect(cells.get('2:2')).toMatchObject({ type: CellType.number, number: 8 });
    expect(cells.get('2:3')).toMatchObject({ text: 'a < b & "c"', formula: null });
    expect(cells.get('3:1')).toMatchObject({ text: 'Bouclier' });
    expect(cells.get('3:2')).toMatchObject({ type: CellType.bool });
    expect(cells.get('1:1')).toMatchObject({ text: 'Produit' });
    expect((await cellsOf(patched, 'Autre')).get('1:1')).toMatchObject({ text: 'intact' });

    const workbookXml = strFromU8(unzipSync(new Uint8Array(patched))['xl/workbook.xml']!);
    expect(workbookXml).toContain('fullCalcOnLoad="1"');
  });

  it('écrit une formule saisie dans la grille, sans valeur', async () => {
    const patched = patchWorkbook(await buildXlsx({ Stock: { A1: 2, B1: 3, C1: 'x' } }), [
      {
        sheet: 'Stock',
        row: 1,
        col: 3,
        value: { type: CellType.empty, text: null, number: null },
        formula: 'A1*B1&">"',
      },
    ]);
    expect((await cellsOf(patched)).get('1:3')).toMatchObject({ formula: 'A1*B1&">"' });
    const sheetXml = strFromU8(unzipSync(new Uint8Array(patched))['xl/worksheets/sheet1.xml']!);
    expect(sheetXml).toContain('<f>A1*B1&amp;&quot;&gt;&quot;</f></c>');
  });

  it('écrit dans une feuille vide', async () => {
    const patched = patchWorkbook(await buildXlsx({ Stock: {} }), [
      { sheet: 'Stock', row: 5, col: 2, value: { type: CellType.number, text: '3', number: 3 } },
    ]);
    expect((await cellsOf(patched)).get('5:2')).toMatchObject({ number: 3 });
  });

  it('garde les formules partagées quand la cellule maîtresse est écrasée', async () => {
    const original = await buildXlsx({
      Stock: {
        A2: 1,
        A3: 2,
        B2: { formula: 'A2*2', result: 2, shareType: 'shared', ref: 'B2:B3' },
        B3: { sharedFormula: 'B2', result: 4 },
      } as never,
    });
    const before = await cellsOf(original);
    const patched = patchWorkbook(
      original,
      [{ sheet: 'Stock', row: 2, col: 2, value: { type: CellType.number, text: '7', number: 7 } }],
      (_sheet, row, col) =>
        [...before.values()].find((c) => c.row === row && c.col === col)?.formula ?? undefined,
    );
    const cells = await cellsOf(patched);
    expect(cells.get('2:2')).toMatchObject({ number: 7, formula: null });
    expect(cells.get('3:2')).toMatchObject({ formula: 'A3*2' });
  });
});
