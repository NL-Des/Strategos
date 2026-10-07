import { randomBytes } from 'node:crypto';
import { CellType, sheetSyntax } from '@strategos/shared';
import { graphCell, isDateFormat, rawValue, scriptCell, sheetsCell } from './cells.js';
import { downloadName } from './gsheet-link.connector.js';
import { SheetCache } from './sheet-cache.js';
import { decryptToken, encryptToken } from './token-crypto.js';

describe('chiffrement des jetons', () => {
  it('aller-retour, et refus d’une clé fausse ou d’un contenu altéré', () => {
    const key = randomBytes(32);
    const payload = encryptToken(key, 'refresh-secret');
    expect(Buffer.from(payload).toString('utf8')).not.toContain('refresh-secret');
    expect(decryptToken(key, payload)).toBe('refresh-secret');
    expect(() => decryptToken(randomBytes(32), payload)).toThrow();
    const altered = Buffer.from(payload);
    altered[altered.length - 1]! ^= 1;
    expect(() => decryptToken(key, altered)).toThrow();
    expect(() => encryptToken(randomBytes(16), 'x')).toThrow();
  });
});

describe('cellules des sources connectées', () => {
  it('Google Sheets : nombre, date, texte, booléen, erreur, formule', () => {
    expect(sheetsCell({ effectiveValue: { numberValue: 8 } })).toMatchObject({
      type: CellType.number,
      text: '8',
      number: 8,
      formula: null,
    });
    expect(
      sheetsCell({
        effectiveValue: { numberValue: 46291 },
        effectiveFormat: { numberFormat: { type: 'DATE' } },
      }),
    ).toMatchObject({ type: CellType.date, text: '2026-09-26' });
    expect(sheetsCell({ effectiveValue: { boolValue: true } })).toMatchObject({
      type: CellType.bool,
      number: 1,
    });
    expect(sheetsCell({ effectiveValue: { errorValue: { type: '#N/A' } } })).toMatchObject({
      type: CellType.error,
    });
    expect(
      sheetsCell({
        effectiveValue: { numberValue: 200 },
        userEnteredValue: { formulaValue: '=C2*D2' },
      }),
    ).toMatchObject({ number: 200, formula: 'C2*D2' });
    // Classeur en français : la formule est rendue dans la syntaxe du fichier.
    expect(
      sheetsCell(
        {
          effectiveValue: { numberValue: 9.5 },
          userEnteredValue: { formulaValue: '=SUM(C2;1,5)' },
        },
        sheetSyntax('fr_FR'),
      ),
    ).toMatchObject({ number: 9.5, formula: 'SUM(C2,1.5)' });
    expect(sheetsCell({})).toBeNull();
  });

  it('Graph : types, formats de date, formules', () => {
    expect(graphCell(8, 'Double', 8, 'General')).toMatchObject({
      type: CellType.number,
      number: 8,
    });
    expect(graphCell(46291, 'Double', 46291, 'dd/mm/yyyy')).toMatchObject({
      type: CellType.date,
      text: '2026-09-26',
    });
    expect(graphCell('Épée', 'String', 'Épée', 'General')).toMatchObject({
      type: CellType.text,
      text: 'Épée',
    });
    expect(graphCell(200, 'Double', '=C2*D2', 'General')).toMatchObject({ formula: 'C2*D2' });
    expect(graphCell('', 'Empty', '', 'General')).toBeNull();
    expect(isDateFormat('"Qté "0')).toBe(false);
    expect(isDateFormat('[$-fr-FR]dddd d mmmm yyyy')).toBe(true);
  });

  it('script Apps Script : types, date en heure du classeur, erreur, formule', () => {
    expect(scriptCell(8, '')).toMatchObject({ type: CellType.number, number: 8, formula: null });
    expect(scriptCell({ d: '2026-09-26T00:00:00' }, '')).toMatchObject({
      type: CellType.date,
      text: '2026-09-26',
      number: 46291,
    });
    expect(scriptCell({ d: '2026-09-26T14:30:00' }, '')).toMatchObject({
      text: '2026-09-26T14:30',
    });
    expect(scriptCell(true, '')).toMatchObject({ type: CellType.bool, number: 1 });
    expect(scriptCell('#DIV/0!', '=1/0')).toMatchObject({ type: CellType.error, formula: '1/0' });
    expect(scriptCell('Épée', '')).toMatchObject({ type: CellType.text, text: 'Épée' });
    expect(scriptCell(200, '=C2*D2')).toMatchObject({ number: 200, formula: 'C2*D2' });
    expect(scriptCell(9.5, '=SUM(C2;1,5)', sheetSyntax('fr_FR'))).toMatchObject({
      formula: 'SUM(C2,1.5)',
    });
    expect(scriptCell('', '')).toBeNull();
    expect(scriptCell('', '=A1')).toMatchObject({ type: CellType.empty, formula: 'A1' });
    expect(scriptCell({ d: 'pas une date' }, '')).toBeNull();
  });

  it('valeurs écrites', () => {
    expect(rawValue({ type: CellType.date, text: '2026-09-26', number: 46291 })).toBe(46291);
    expect(rawValue({ type: CellType.bool, text: 'VRAI', number: 1 })).toBe(true);
    expect(rawValue({ type: CellType.empty, text: null, number: null })).toBe('');
  });
});

describe('Google Sheet par lien public', () => {
  it('nom du Sheet lu dans Content-Disposition', () => {
    expect(
      downloadName(
        `attachment; filename="Stock.xlsx"; filename*=UTF-8''Stock%20guilde%20%C3%A9t%C3%A9.xlsx`,
      ),
    ).toBe('Stock guilde été');
    expect(downloadName('attachment; filename="Stock.xlsx"')).toBe('Stock');
    expect(downloadName(`attachment; filename*=UTF-8''%E0%A4%A.xlsx`)).toBe('Google Sheet');
    expect(downloadName(null)).toBe('Google Sheet');
  });
});

describe('cache des feuilles', () => {
  it('sert la copie pendant sa durée de vie, puis relit ; invalidation par source', async () => {
    let now = 0;
    const cache = new SheetCache(
      () => 1000,
      () => now,
    );
    let loads = 0;
    const load = async () => ++loads;
    expect(await cache.get('s1', 'A', load)).toBe(1);
    expect(await cache.get('s1', 'A', load)).toBe(1);
    now = 1001;
    expect(await cache.get('s1', 'A', load)).toBe(2);
    cache.invalidate('s1');
    expect(await cache.get('s1', 'A', load)).toBe(3);
    // Une lecture en échec n'est pas gardée.
    await expect(cache.get('s2', 'A', () => Promise.reject(new Error('x')))).rejects.toThrow();
    expect(await cache.get('s2', 'A', load)).toBe(4);
  });
});
