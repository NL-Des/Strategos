import { randomBytes } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type {
  AdminPage,
  AssembledPage,
  Block,
  FormDefinition,
  GooglePickerSession,
  GoogleStatus,
  OneDriveItem,
  OneDriveStatus,
  Paginated,
  Row,
  SourceSummary,
  Submission,
  TableRow,
} from '@strategos/shared';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { FakeApis, type FakeSheets, GOOGLE_ACCOUNT } from './fake-apis.js';
import {
  TestClient,
  adminClient,
  createGroup,
  createTestApp,
  expectStatus,
  meId,
  resetDatabase,
  uid,
  userClient,
} from './helpers.js';

const SHEET_ID = 'SHEET_stock_guilde_0123456789';

const stock = (): FakeSheets => ({
  Stock: {
    A1: 'Référence',
    B1: 'Produit',
    C1: 'Quantité',
    D1: 'Prix',
    E1: 'Valeur',
    A2: 101,
    B2: 'Épée',
    C2: 8,
    D2: 25,
    E2: { f: '=C2*D2', v: 200 },
    A3: 137,
    B3: 'Bouclier',
    C3: 5,
    D3: 40,
    E3: { f: '=C3*D3', v: 200 },
  },
});

const rowOf = (block: Block): Row => ({ id: uid(), columns: [{ width: '1/1', block }] });

describe('Sources connectées : Google Sheets et OneDrive (e2e)', () => {
  const fake = new FakeApis();
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: TestClient;
  let kira: TestClient;

  beforeAll(async () => {
    const base = await fake.start();
    Object.assign(process.env, {
      GOOGLE_AUTH_URL: `${base}/google/authorize`,
      GOOGLE_TOKEN_URL: `${base}/google/token`,
      GOOGLE_USERINFO_URL: `${base}/google/userinfo`,
      GOOGLE_CLIENT_ID: '123456789-client-test.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'secret-test',
      GOOGLE_API_KEY: 'api-key-test',
      GOOGLE_SHEETS_API: `${base}/sheets`,
      MICROSOFT_LOGIN_URL: `${base}/ms`,
      GRAPH_API: `${base}/graph`,
      AZURE_CLIENT_ID: 'client-test',
      AZURE_CLIENT_SECRET: 'secret-test',
      TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
      SOURCE_CACHE_MS: '60000',
    });
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    fake.reset();
    await resetDatabase(app);
    admin = await adminClient(app);
    kira = await userClient(app, admin, 'kira');
  });

  afterAll(async () => {
    await app.close();
    await fake.stop();
  });

  /** Lance la connexion Google ; renvoie le `state` attendu au retour. */
  async function googleState(): Promise<string> {
    const res = await admin.get('/admin/google/connect');
    expect(res.status).toBe(302);
    const location = new URL(res.headers.location as string);
    expect(location.pathname).toBe('/google/authorize');
    return location.searchParams.get('state')!;
  }

  async function connectGoogle(): Promise<void> {
    const state = await googleState();
    const back = await new TestClient(app).get(`/google/callback?code=good-code&state=${state}`);
    expect(back.headers.location).toBe('/admin/sources?google=connected');
  }

  const pickSheet = () =>
    admin.send('post', '/admin/sources', { type: 'gsheet', spreadsheetId: SHEET_ID });

  /** Compte Google connecté, Sheet choisi dans le sélecteur et ajouté. */
  async function addSheet(): Promise<SourceSummary> {
    await connectGoogle();
    fake.spreadsheets.set(SHEET_ID, { title: 'Stock guilde', picked: true, sheets: stock() });
    const res = await pickSheet();
    expectStatus(res, 201);
    return res.body as SourceSummary;
  }

  const table = (sourceId: string): Block => ({
    id: uid(),
    type: 'table',
    config: {
      sourceId,
      sheet: 'Stock',
      range: { mode: 'extensible', columns: 'A:E', startRow: 1 },
      headerRow: true,
      columns: [
        { col: 'B', visible: true, label: '', format: 'text' },
        { col: 'C', visible: true, label: '', format: 'number' },
      ],
      pageSize: 10,
      sortable: true,
      searchable: true,
    },
  });

  /** Page publiée, lisible par Kira, avec un tableau et, en option, un formulaire de ligne. */
  async function buildPage(sourceId: string, withForm: boolean) {
    const page = (await admin.send('post', '/admin/pages', { name: 'Stock' })).body as AdminPage;
    const t = table(sourceId);
    const blocks: Block[] = [t];
    let formId: string | undefined;
    if (withForm) {
      const blockId = uid();
      const res = await admin.send('post', '/admin/forms', {
        pageId: page.id,
        pageBlockId: blockId,
        mode: 'ligne',
      });
      expectStatus(res, 201);
      formId = res.body.id as string;
      blocks.push({ id: blockId, type: 'form', config: { formId } });
    }
    const saved = await admin.send('put', `/admin/pages/${page.id}/draft`, {
      name: 'Stock',
      config: {
        zones: { main: blocks.map(rowOf), sidebar: null },
        themeId: null,
        showHeader: true,
        showFooter: true,
      },
      version: page.version,
    });
    expectStatus(saved, 200);
    if (formId) {
      const definition: FormDefinition = {
        title: 'Mouvement de stock',
        intro: '',
        successMessage: '',
        sourceId,
        sheet: 'Stock',
        rowStart: 2,
        rowEnd: null,
        keyCol: 'A',
        linkedBlockId: t.id,
        fields: [
          {
            key: 'qte',
            label: 'Quantité',
            help: '',
            type: 'number',
            required: true,
            col: 'C',
            movement: true,
          },
        ],
      };
      expectStatus(
        await admin.send('put', `/admin/forms/${formId}/draft`, { version: 1, definition }),
        200,
      );
    }
    expectStatus(await admin.send('post', `/admin/pages/${page.id}/publish`, {}), 200);
    await createGroup(admin, 'Magasiniers', { userIds: [await meId(kira)], pageIds: [page.id] });
    return { pageId: page.id, tableId: t.id, formId };
  }

  const rows = async (client: TestClient, blockId: string) => {
    const res = await client.get(`/blocks/${blockId}/rows`);
    expectStatus(res, 200);
    return (res.body as Paginated<TableRow>).items.map((r) => r.cells.map((c) => c.value));
  };

  describe('Google Sheets', () => {
    it('connexion : réservée à l’admin, state vérifié, jeton chiffré jamais renvoyé, tracée', async () => {
      expect((await admin.get('/admin/google/status')).body).toEqual({
        configured: true,
        connected: false,
        accountLabel: null,
        expired: false,
      });
      expect((await kira.get('/admin/google/connect')).status).toBe(404);
      expect((await kira.get('/admin/google/picker')).status).toBe(404);
      // Pas encore connecté : pas de sélecteur.
      const early = await admin.get('/admin/google/picker');
      expect(early.status).toBe(503);
      expect(early.body.code).toBe('SOURCE_AUTH_EXPIRED');

      const connect = await admin.get('/admin/google/connect');
      const consent = new URL(connect.headers.location as string).searchParams;
      // Seulement les fichiers choisis par l'admin, jamais tout son Drive.
      expect(consent.get('scope')).toBe('openid email https://www.googleapis.com/auth/drive.file');
      expect(consent.get('access_type')).toBe('offline');

      const state = consent.get('state')!;
      // Retour de Google : navigation venue d'un autre site, sans cookie de session.
      const browser = new TestClient(app);
      const forged = await browser.get('/google/callback?code=good-code&state=faux');
      expect(forged.headers.location).toBe('/admin/sources?google=failed');
      const ok = await browser.get(`/google/callback?code=good-code&state=${state}`);
      expect(ok.headers.location).toBe('/admin/sources?google=connected');
      const replay = await browser.get(`/google/callback?code=good-code&state=${state}`);
      expect(replay.headers.location).toBe('/admin/sources?google=failed');

      expect((await admin.get('/admin/google/status')).body as GoogleStatus).toEqual({
        configured: true,
        connected: true,
        accountLabel: GOOGLE_ACCOUNT,
        expired: false,
      });
      const row = await prisma.googleCredential.findUniqueOrThrow({ where: { id: 1 } });
      expect(Buffer.from(row.refreshTokenEncrypted).toString('latin1')).not.toContain(
        'google-refresh',
      );
      const entry = await prisma.auditLog.findFirstOrThrow({ where: { action: 'google.connect' } });
      expect(entry.after).toEqual({ accountLabel: GOOGLE_ACCOUNT });

      // Sélecteur : jeton d'accès court, clé d'API et numéro du projet ; jamais le refresh token.
      const picker = await admin.get('/admin/google/picker');
      expectStatus(picker, 200);
      const session = picker.body as GooglePickerSession;
      expect(session).toEqual({
        accessToken: expect.stringMatching(/^google-access-/) as string,
        apiKey: 'api-key-test',
        appId: '123456789',
      });
    });

    it('Sheet non choisi refusé ; ajout avec son nom et ses feuilles ; choisi de nouveau, pas dupliqué', async () => {
      await connectGoogle();
      fake.spreadsheets.set(SHEET_ID, { title: 'Stock guilde', picked: false, sheets: stock() });
      const refused = await pickSheet();
      expect(refused.status).toBe(503);
      expect(refused.body.code).toBe('SOURCE_UNAVAILABLE');
      const bad = await admin.send('post', '/admin/sources', {
        type: 'gsheet',
        spreadsheetId: 'https://ex.org',
      });
      expect(bad.status).toBe(400);

      const source = await addSheet();
      expect(source).toMatchObject({
        type: 'gsheet',
        name: 'Stock guilde',
        status: 'ok',
        sheets: ['Stock'],
      });
      expect(
        await prisma.auditLog.count({ where: { action: 'source.add', targetId: source.id } }),
      ).toBe(1);
      expect(JSON.stringify(source)).not.toContain('google-');

      const again = await pickSheet();
      expect((again.body as SourceSummary).id).toBe(source.id);
      expect(await prisma.source.count()).toBe(1);
    });

    it('connexion révoquée : SOURCE_AUTH_EXPIRED, Sheets en auth_expired, reconnexion', async () => {
      const source = await addSheet();
      fake.googleRefreshValid = false;
      const expired = await admin.send('post', `/admin/sources/${source.id}/test`);
      expect(expired.status).toBe(503);
      expect(expired.body.code).toBe('SOURCE_AUTH_EXPIRED');
      expect(((await admin.get('/admin/google/status')).body as GoogleStatus).expired).toBe(true);
      expect(((await admin.get('/admin/sources')).body as SourceSummary[])[0]!.status).toBe(
        'auth_expired',
      );

      fake.googleRefreshValid = true;
      await connectGoogle();
      expect(((await admin.get('/admin/google/status')).body as GoogleStatus).connected).toBe(true);
      expect(((await admin.get('/admin/sources')).body as SourceSummary[])[0]!.status).toBe('ok');
      expectStatus(await admin.send('post', `/admin/sources/${source.id}/test`), 200);
    });

    it('tableau et formulaire de ligne : même interface, cache, écriture dans le Sheet, aucune copie en base', async () => {
      const source = await addSheet();
      const { tableId, formId } = await buildPage(source.id, true);
      expect(await rows(kira, tableId)).toEqual([
        ['Épée', '8'],
        ['Bouclier', '5'],
      ]);
      const reads = fake.sheetReads;
      await rows(kira, tableId);
      expect(fake.sheetReads).toBe(reads);

      const s = (
        await kira.send('post', `/forms/${formId}/submissions`, {
          values: { qte: -3 },
          rowKey: '101',
        })
      ).body as Submission;
      expect(s.status).toBe('pending');
      expectStatus(await admin.send('post', `/admin/submissions/${s.id}/validate`, {}), 200);
      expect(fake.spreadsheets.get(SHEET_ID)!.sheets.Stock!.C2).toBe(5);
      // Cache vidé après l'écriture : la valeur à jour est relue.
      expect(await rows(kira, tableId)).toEqual([
        ['Épée', '5'],
        ['Bouclier', '5'],
      ]);
      expect(fake.sheetReads).toBeGreaterThan(reads);
      expect(await prisma.stagingCell.count({ where: { sourceId: source.id } })).toBe(0);
      const entry = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'submission.validate' },
      });
      expect(entry.after).toMatchObject({
        cells: [{ cell: 'Stock!C2', before: '8', after: '5', movement: -3 }],
      });
    });

    it('accès au Sheet retiré : test d’accès en SOURCE_UNAVAILABLE, module indisponible, page affichée', async () => {
      const source = await addSheet();
      const { pageId } = await buildPage(source.id, false);
      fake.spreadsheets.get(SHEET_ID)!.picked = false;
      const test = await admin.send('post', `/admin/sources/${source.id}/test`);
      expect(test.status).toBe(503);
      expect(test.body.code).toBe('SOURCE_UNAVAILABLE');
      const list = (await admin.get('/admin/sources')).body as SourceSummary[];
      expect(list[0]!.status).toBe('unavailable');

      const page = (await kira.get(`/pages/${pageId}`)).body as AssembledPage;
      expect(page.zones.main![0]!.columns[0]!.block).toMatchObject({ error: 'SOURCE_UNAVAILABLE' });
      expect(page.unavailableSources).toEqual([]);
      const asAdmin = (await admin.get(`/pages/${pageId}`)).body as AssembledPage;
      expect(asAdmin.unavailableSources).toEqual([{ id: source.id, name: 'Stock guilde' }]);

      fake.spreadsheets.get(SHEET_ID)!.picked = true;
      const back = await admin.send('post', `/admin/sources/${source.id}/test`);
      expectStatus(back, 200);
      expect(back.body.status).toBe('ok');
    });
  });

  describe('OneDrive', () => {
    async function connect(): Promise<string> {
      const res = await admin.get('/admin/onedrive/connect');
      expect(res.status).toBe(302);
      const location = new URL(res.headers.location as string);
      expect(location.pathname).toBe('/ms/common/oauth2/v2.0/authorize');
      return location.searchParams.get('state')!;
    }

    it('connexion : state vérifié, jeton chiffré jamais renvoyé, ajout d’un fichier, expiration signalée', async () => {
      expect((await admin.get('/admin/onedrive/status')).body).toEqual({
        configured: true,
        connected: false,
        accountLabel: null,
        expired: false,
      });
      expect((await kira.get('/admin/onedrive/connect')).status).toBe(404);

      const state = await connect();
      // Retour de Microsoft : navigation venue d'un autre site, sans cookie de session.
      const browser = new TestClient(app);
      const forged = await browser.get('/onedrive/callback?code=good-code&state=faux');
      expect(forged.headers.location).toBe('/admin/sources?onedrive=failed');
      const ok = await browser.get(`/onedrive/callback?code=good-code&state=${state}`);
      expect(ok.headers.location).toBe('/admin/sources?onedrive=connected');
      const replay = await browser.get(`/onedrive/callback?code=good-code&state=${state}`);
      expect(replay.headers.location).toBe('/admin/sources?onedrive=failed');

      const status = (await admin.get('/admin/onedrive/status')).body as OneDriveStatus;
      expect(status).toEqual({
        configured: true,
        connected: true,
        accountLabel: 'marc@entreprise.fr',
        expired: false,
      });
      const row = await prisma.onedriveCredential.findUniqueOrThrow({ where: { id: 1 } });
      expect(Buffer.from(row.refreshTokenEncrypted).toString('latin1')).not.toContain('ms-refresh');
      expect(await prisma.auditLog.count({ where: { action: 'onedrive.connect' } })).toBe(1);

      fake.workbooks.set('item-stock', { name: 'stock.xlsx', sheets: stock() });
      const items = (await admin.get('/admin/onedrive/browse')).body as OneDriveItem[];
      expect(items.map((i) => [i.name, i.folder])).toEqual([
        ['stock.xlsx', false],
        ['Archives', true],
      ]);
      const added = await admin.send('post', '/admin/sources', {
        type: 'onedrive',
        itemId: 'item-stock',
      });
      expectStatus(added, 201);
      const source = added.body as SourceSummary;
      expect(source).toMatchObject({ type: 'onedrive', name: 'stock.xlsx', sheets: ['Stock'] });
      expect(JSON.stringify(added.body)).not.toContain('ms-refresh');

      const { tableId } = await buildPage(source.id, false);
      expect(await rows(kira, tableId)).toEqual([
        ['Épée', '8'],
        ['Bouclier', '5'],
      ]);

      // Connexion révoquée chez Microsoft : expiration signalée dans l'espace admin.
      fake.refreshValid = false;
      const expired = await admin.send('post', `/admin/sources/${source.id}/test`);
      expect(expired.status).toBe(503);
      expect(expired.body.code).toBe('SOURCE_AUTH_EXPIRED');
      expect(((await admin.get('/admin/onedrive/status')).body as OneDriveStatus).expired).toBe(
        true,
      );
      expect(((await admin.get('/admin/sources')).body as SourceSummary[])[0]!.status).toBe(
        'auth_expired',
      );

      // Reconnexion.
      fake.refreshValid = true;
      const again = await connect();
      await browser.get(`/onedrive/callback?code=good-code&state=${again}`);
      expect(((await admin.get('/admin/onedrive/status')).body as OneDriveStatus).connected).toBe(
        true,
      );
      expect(((await admin.get('/admin/sources')).body as SourceSummary[])[0]!.status).toBe('ok');
    });

    it('écriture dans le fichier en ligne par un formulaire de ligne', async () => {
      const state = await connect();
      await new TestClient(app).get(`/onedrive/callback?code=good-code&state=${state}`);
      fake.workbooks.set('item-stock', { name: 'stock.xlsx', sheets: stock() });
      const source = (
        await admin.send('post', '/admin/sources', { type: 'onedrive', itemId: 'item-stock' })
      ).body as SourceSummary;
      const { formId } = await buildPage(source.id, true);
      const s = (
        await kira.send('post', `/forms/${formId}/submissions`, {
          values: { qte: 4 },
          rowKey: '137',
        })
      ).body as Submission;
      expectStatus(await admin.send('post', `/admin/submissions/${s.id}/validate`, {}), 200);
      expect(fake.workbooks.get('item-stock')!.sheets.Stock!.C3).toBe(9);
    });
  });
});
