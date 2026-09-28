import { randomBytes } from 'node:crypto';
import { CellType } from '@strategos/shared';
import { graphCell, isDateFormat, rawValue, sheetsCell, spreadsheetIdOf } from './cells.js';
import { SheetCache } from './sheet-cache.js';
import { decryptToken, encryptToken } from './token-crypto.js';

describe('chiffrement du jeton OneDrive', () => {
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
    ).toMatchObject({ number: 200, formula: '=C2*D2' });
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

  it('valeurs écrites et lien d’un Sheet', () => {
    expect(rawValue({ type: CellType.date, text: '2026-09-26', number: 46291 })).toBe(46291);
    expect(rawValue({ type: CellType.bool, text: 'VRAI', number: 1 })).toBe(true);
    expect(rawValue({ type: CellType.empty, text: null, number: null })).toBe('');
    const id = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';
    expect(spreadsheetIdOf(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`)).toBe(id);
    expect(spreadsheetIdOf(id)).toBe(id);
    expect(spreadsheetIdOf('https://example.org')).toBeNull();
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
