import vm from 'node:vm';
import { scriptSource } from './gsheet-script.template.js';

/**
 * Le script que l'admin colle dans son Sheet, exécuté ici avec de faux services
 * Apps Script : son protocole est vérifié, pas le comportement de Google.
 */
it('script Apps Script : meta, read, write, secret refusé', () => {
  const cells: Record<string, unknown> = {};
  const data = [
    ['Réf', 'Date'],
    [101, new Date(2026, 8, 26, 14, 30)],
  ];
  const sheet = {
    getName: () => 'Stock',
    getDataRange: () => ({
      getValues: () => data,
      getFormulas: () => [
        ['', ''],
        ['', '=TODAY()'],
      ],
    }),
    getRange: (row: number, col: number) => ({
      setValue: (v: unknown) => (cells[`${row}:${col}`] = v),
    }),
  };
  let locked = 0;
  const context = vm.createContext({
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getName: () => 'Stock guilde',
        getSheets: () => [sheet],
        getSheetByName: (n: string) => (n === 'Stock' ? sheet : null),
        getSpreadsheetTimeZone: () => 'Europe/Paris',
      }),
      flush: () => undefined,
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (text: string) => ({ setMimeType: () => text }),
    },
    LockService: {
      getScriptLock: () => ({ waitLock: () => locked++, releaseLock: () => locked-- }),
    },
    Utilities: { formatDate: (d: Date) => `${d.getFullYear()}-09-26T14:30:00` },
  });
  vm.runInContext(scriptSource('s3cret'), context);
  const post = (body: object) =>
    JSON.parse(
      vm.runInContext(
        `doPost(${JSON.stringify({ postData: { contents: JSON.stringify(body) } })})`,
        context,
      ) as string,
    ) as Record<string, unknown>;

  expect(post({ secret: 'faux', action: 'meta' })).toEqual({
    ok: false,
    error: 'forbidden',
    version: 1,
  });
  expect(post({ secret: 's3cret', action: 'meta' })).toEqual({
    ok: true,
    name: 'Stock guilde',
    sheets: ['Stock'],
    version: 1,
  });
  // Une date créée hors du script n'est pas une `Date` pour lui : seules les formules sont vérifiées.
  expect(post({ secret: 's3cret', action: 'read', sheet: 'Stock' })).toMatchObject({
    ok: true,
    formulas: [
      ['', ''],
      ['', '=TODAY()'],
    ],
  });
  expect(post({ secret: 's3cret', action: 'read', sheet: 'Absente' })).toMatchObject({
    ok: true,
    values: [],
  });
  expect(
    post({
      secret: 's3cret',
      action: 'write',
      writes: [
        { sheet: 'Stock', row: 2, col: 3, value: 5 },
        { sheet: 'Stock', row: 3, col: 2, value: '=A1' },
        { sheet: 'Stock', row: 4, col: 2, value: '' },
        { sheet: 'Stock', row: 5, col: 2, value: true },
      ],
    }),
  ).toEqual({ ok: true, version: 1 });
  expect(cells).toEqual({ '2:3': 5, '3:2': "'=A1", '4:2': '', '5:2': true });
  expect(locked).toBe(0);
  expect(
    post({
      secret: 's3cret',
      action: 'write',
      writes: [{ sheet: 'Absente', row: 1, col: 1, value: 1 }],
    }),
  ).toMatchObject({ ok: false });
  expect(locked).toBe(0);
  expect(post({ secret: 's3cret', action: 'autre' })).toMatchObject({ ok: false });
});
