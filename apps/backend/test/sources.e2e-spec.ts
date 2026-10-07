import type { NestExpressApplication } from '@nestjs/platform-express';
import type {
  AdminPage,
  AssembledPage,
  Block,
  CatalogCard,
  Paginated,
  ReimportPreview,
  Row,
  SourceGrid,
  SourceSummary,
  TableRow,
} from '@strategos/shared';
import { cellRef } from '@strategos/shared';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { parseWorkbook } from '../src/sources/excel-parser.js';
import {
  PNG,
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
import { buildXlsx, withExternalLink } from './xlsx.js';

/** Feuille au nom reconnaissable : il ne doit jamais apparaître côté utilisateur. */
const SHEET = 'FeuilleInterne';

/** Stock : en-têtes en ligne 1, 4 produits, une formule dont la valeur stockée est fausse. */
async function stockXlsx() {
  return buildXlsx({
    [SHEET]: {
      A1: 'Produit',
      B1: 'Quantité',
      C1: 'Prix',
      D1: 'Image',
      A2: 'Épée',
      B2: 10,
      C2: 25.5,
      D2: 'epee.png',
      A3: 'Bouclier',
      B3: 4,
      C3: 40,
      D3: 'https://ex.org/bouclier.png',
      A4: 'Arc',
      B4: 7,
      C4: 30,
      D4: 'inconnue.png',
      A5: 'Potion',
      B5: 25,
      C5: 2,
      E1: 'Trésor',
      // B2 × C2 vaut 255 : la valeur stockée (99) est affichée, rien n'est calculé.
      E2: { formula: 'B2*C2', result: 99 },
    },
  });
}

type TableBlock = Extract<Block, { type: 'table' }>;
type CatalogBlock = Extract<Block, { type: 'catalog' }>;

const rowOf = (block: Row['columns'][number]['block']): Row => ({
  id: uid(),
  columns: [{ width: '1/1', block }],
});

describe('Sources et modules de données (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: TestClient;
  let kira: TestClient;
  let source: SourceSummary;
  let stockFile: Buffer;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    admin = await adminClient(app);
    kira = await userClient(app, admin, 'kira');
    stockFile = await stockXlsx();
    source = await upload(stockFile, 'stock.xlsx');
  });

  afterAll(async () => {
    await app.close();
  });

  async function upload(file: Buffer, name: string): Promise<SourceSummary> {
    const res = await admin.upload('/admin/sources/upload', file, name);
    expectStatus(res, 201);
    return res.body as SourceSummary;
  }

  const table = (extra: object = {}): TableBlock => ({
    id: uid(),
    type: 'table' as const,
    config: {
      sourceId: source.id,
      sheet: SHEET,
      range: { mode: 'extensible', columns: 'A:C', startRow: 1 },
      headerRow: true,
      columns: [
        { col: 'A', visible: true, label: '', format: 'text' },
        { col: 'B', visible: true, label: 'Stock', format: 'number' },
        { col: 'C', visible: true, label: '', format: 'currency' },
      ],
      pageSize: 10,
      sortable: true,
      searchable: true,
      ...extra,
    },
  });

  const catalog = (): CatalogBlock => ({
    id: uid(),
    type: 'catalog' as const,
    config: {
      sourceId: source.id,
      sheet: SHEET,
      range: { mode: 'fixed', ref: 'A1:D5' },
      headerRow: true,
      layout: 'image_top',
      imageCol: 'D',
      titleCol: 'A',
      details: [{ col: 'B', label: '', format: 'number' }],
      perRow: 3,
      pageSize: 10,
      searchable: true,
    },
  });

  const rich = (ref: string, sourceId = source.id, format = 'number'): Block => ({
    id: uid(),
    type: 'rich_content' as const,
    config: {
      html: `<p>Valeur : <span data-cell-source="${sourceId}" data-cell-sheet="${SHEET}" data-cell-ref="${ref}" data-cell-format="${format}">x</span></p>`,
    },
  });

  /** Page publiée, lisible par Kira, avec ces modules. */
  async function publishPage(blocks: Row['columns'][number]['block'][]): Promise<string> {
    const page = (await admin.send('post', '/admin/pages', { name: 'Stock' })).body as AdminPage;
    const saved = await admin.send('put', `/admin/pages/${page.id}/draft`, {
      name: 'Stock',
      config: {
        zones: { main: blocks.map(rowOf), sidebar: null },
        themeId: null,
        showHeader: true,
        showFooter: true,
        showSidebar: false,
      },
      version: page.version,
    });
    expectStatus(saved, 200);
    expectStatus(await admin.send('post', `/admin/pages/${page.id}/publish`), 200);
    await createGroup(admin, `Lecteurs ${page.id.slice(-4)}`, {
      userIds: [await meId(kira)],
      pageIds: [page.id],
    });
    return page.id;
  }

  const rows = async <T>(client: TestClient, blockId: string, query = '') => {
    const res = await client.get(`/blocks/${blockId}/rows${query}`);
    expectStatus(res, 200);
    return res.body as Paginated<T>;
  };

  describe('écran Sources', () => {
    it('upload : feuilles listées, fichier non Excel refusé (415), classeur illisible (422)', async () => {
      expect(source).toMatchObject({ type: 'upload', name: 'stock.xlsx', status: 'ok' });
      expect(source.sheets).toEqual([SHEET]);
      expect(source.lastImportedAt).not.toBeNull();

      expect((await admin.upload('/admin/sources/upload', PNG, 'x.xlsx')).status).toBe(415);
      const files = unzipSync(new Uint8Array(await stockXlsx()));
      files['xl/workbook.xml'] = strToU8('<pas du xml');
      const broken = await admin.upload(
        '/admin/sources/upload',
        Buffer.from(zipSync(files)),
        'casse.xlsx',
      );
      expect(broken.status).toBe(422);
      expect(broken.body.code).toBe('EXCEL_PARSE_FAILED');
    });

    it('téléchargement : fichier de référence, last_downloaded_at mis à jour, tracé', async () => {
      const res = await admin
        .get(`/admin/sources/${source.id}/download`)
        .buffer(true)
        .parse((r, done) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => done(null, Buffer.concat(chunks)));
        });
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain('stock.xlsx');
      expect(Buffer.compare(res.body as Buffer, stockFile)).toBe(0);
      const list = (await admin.get('/admin/sources')).body as SourceSummary[];
      expect(list[0]!.lastDownloadedAt).not.toBeNull();
      const entry = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'source.download' },
      });
      expect(entry.targetId).toBe(source.id);
    });

    it('grille : fenêtre du staging, formules et dimensions ; bornes et 404', async () => {
      const res = await admin.get(`/admin/sources/${source.id}/cells?top=2&left=2&rows=2&cols=4`);
      expectStatus(res, 200);
      const grid = res.body as SourceGrid;
      expect(grid).toMatchObject({ sheets: [SHEET], sheet: SHEET, maxRow: 5, maxCol: 5, top: 2 });
      expect(grid.cells.map((c) => cellRef(c))).toEqual(['B2', 'C2', 'D2', 'E2', 'B3', 'C3', 'D3']);
      expect(grid.cells.find((c) => c.col === 5)).toMatchObject({
        display: '99',
        formula: 'B2*C2',
        needsRecalc: false,
      });
      expect((await admin.get(`/admin/sources/${source.id}/cells?rows=201`)).status).toBe(400);
      expect((await admin.get(`/admin/sources/${source.id}/cells?sheet=Absente`)).status).toBe(404);
      expect((await admin.get(`/admin/sources/${uid()}/cells`)).status).toBe(404);
      expect((await kira.get(`/admin/sources/${source.id}/cells`)).status).toBe(404);
    });

    it('retirer une source utilisée → 409 CONFIRMATION_REQUIRED, puis confirm: true', async () => {
      await publishPage([table()]);
      const res = await admin.send('delete', `/admin/sources/${source.id}`, {});
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CONFIRMATION_REQUIRED');
      expect(res.body.details.warnings[0]).toMatchObject({
        code: 'SOURCE_IN_USE',
        pages: [{ name: 'Stock' }],
      });
      expectStatus(
        await admin.send('delete', `/admin/sources/${source.id}`, { confirm: true }),
        204,
      );
      expect((await admin.get('/admin/sources')).body).toEqual([]);
    });

    it('routes des sources → 404 pour un non-admin', async () => {
      expect((await kira.get('/admin/sources')).status).toBe(404);
      expect((await kira.get(`/admin/sources/${source.id}/download`)).status).toBe(404);
    });

    it('brouillon : source ou feuille inconnue → 400', async () => {
      const page = (await admin.send('post', '/admin/pages', { name: 'P' })).body as AdminPage;
      const save = (block: object) =>
        admin.send('put', `/admin/pages/${page.id}/draft`, {
          name: 'P',
          config: { zones: { main: [rowOf(block as never)], sidebar: null } },
          version: page.version,
        });
      const path = 'config.zones.main[0].columns[0].block.config';
      const unknown = await save(table({ sourceId: uid() }));
      expect(unknown.body.details.fields).toEqual({ [`${path}.sourceId`]: ['sourceNotFound'] });
      const sheet = await save(table({ sheet: 'Absente' }));
      expect(sheet.body.details.fields).toEqual({ [`${path}.sheet`]: ['sheetNotFound'] });
    });
  });

  describe('grille : modification par l’admin', () => {
    const editCell = (row: number, col: number, input: string, expected: object) =>
      admin.send('patch', `/admin/sources/${source.id}/cells`, {
        sheet: SHEET,
        row,
        col,
        expected,
        input,
      });
    const staged = (row: number, col: number) =>
      prisma.stagingCell.findUnique({
        where: { sourceId_sheet_row_col: { sourceId: source.id, sheet: SHEET, row, col } },
      });
    async function download(): Promise<Buffer> {
      const res = await admin
        .get(`/admin/sources/${source.id}/download`)
        .buffer(true)
        .parse((r, done) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => done(null, Buffer.concat(chunks)));
        });
      expectStatus(res, 200);
      return res.body as Buffer;
    }
    async function reimportPreview(file: Buffer) {
      const res = await admin.upload(
        `/admin/sources/${source.id}/reimport/preview`,
        file,
        'stock.xlsx',
      );
      expectStatus(res, 200);
      return res.body as ReimportPreview;
    }
    const confirmReimport = (reimportToken: string, mode: string) =>
      admin.send('post', `/admin/sources/${source.id}/reimport/confirm`, { reimportToken, mode });

    it('valeur : dépendantes « à recalculer », tracée ; contenu périmé → 409 EDIT_CONFLICT', async () => {
      const res = await editCell(2, 2, '12', { display: '10', formula: null });
      expectStatus(res, 200);
      expect(res.body).toMatchObject({ type: 'number', display: '12', formula: null });
      expect(await staged(2, 2)).toMatchObject({ valueType: 'number', valueText: '12' });
      expect(await staged(2, 5)).toMatchObject({ formula: 'B2*C2', needsRecalc: true });
      const entry = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'source.edit_cell' },
      });
      expect(entry.before).toMatchObject({ cell: `${SHEET}!B2`, text: '10' });
      expect(entry.after).toMatchObject({ cell: `${SHEET}!B2`, text: '12', number: 12 });
      expect(await prisma.sourceCellEdit.count()).toBe(1);

      const stale = await editCell(2, 2, '13', { display: '10', formula: null });
      expect(stale.status).toBe(409);
      expect(stale.body.code).toBe('EDIT_CONFLICT');
      expect((await editCell(2, 2, '', { display: '12', formula: null })).status).toBe(200);
      expect(await staged(2, 2)).toMatchObject({ valueType: 'empty' });
    });

    it('formule : posée sans calcul ; autre classeur → 422 ; feuille inconnue ou non-admin → 404', async () => {
      const added = await editCell(2, 6, '=B2*2', { display: '', formula: null });
      expectStatus(added, 200);
      expect(added.body).toMatchObject({ formula: 'B2*2', display: '', needsRecalc: true });
      // Formule remplacée : la valeur de l'ancienne reste affichée, marquée à recalculer.
      const changed = await editCell(2, 5, '=B2+C2', { display: '99', formula: 'B2*C2' });
      expect(changed.body).toMatchObject({ formula: 'B2+C2', display: '99', needsRecalc: true });

      const external = await editCell(3, 6, '=[1]Stock!A1', { display: '', formula: null });
      expect(external.status).toBe(422);
      expect(external.body.code).toBe('FORMULA_EXTERNAL_REF');
      const unknownSheet = await admin.send('patch', `/admin/sources/${source.id}/cells`, {
        sheet: 'Absente',
        row: 1,
        col: 1,
        expected: { display: '', formula: null },
        input: 'x',
      });
      expect(unknownSheet.status).toBe(404);
      const byKira = await kira.send('patch', `/admin/sources/${source.id}/cells`, {
        sheet: SHEET,
        row: 1,
        col: 1,
        expected: { display: 'Produit', formula: null },
        input: 'x',
      });
      expect(byKira.status).toBe(404);
    });

    it('téléchargement : valeurs et formules saisies reportées dans le fichier', async () => {
      await editCell(2, 2, '12', { display: '10', formula: null });
      await editCell(2, 6, '=B2*2', { display: '', formula: null });
      await editCell(2, 5, '=B2+C2', { display: '99', formula: 'B2*C2' });
      const book = await parseWorkbook(await download());
      const cells = new Map(book.sheets[0]!.cells.map((c) => [cellRef(c), c]));
      expect(cells.get('B2')).toMatchObject({ number: 12, formula: null });
      expect(cells.get('F2')).toMatchObject({ formula: 'B2*2' });
      expect(cells.get('E2')).toMatchObject({ formula: 'B2+C2' });
      expect(cells.get('A2')).toMatchObject({ text: 'Épée' });
    });

    it('réimport : saisies perdues listées, réappliquées dans l’ordre ou écrasées', async () => {
      await editCell(2, 2, '12', { display: '10', formula: null });
      await editCell(2, 2, '14', { display: '12', formula: null });
      await editCell(2, 6, '=B2*2', { display: '', formula: null });

      const preview = await reimportPreview(stockFile);
      expect(preview.lostValidations).toEqual([
        expect.objectContaining({
          submissionId: null,
          cell: `${SHEET}!B2`,
          validatedValue: '14',
          valueInNewFile: '10',
        }),
        expect.objectContaining({
          submissionId: null,
          cell: `${SHEET}!F2`,
          validatedValue: '=B2*2',
          valueInNewFile: null,
        }),
      ]);
      expectStatus(await confirmReimport(preview.reimportToken, 'reapply'), 204);
      expect(await staged(2, 2)).toMatchObject({ valueText: '14' });
      expect(await staged(2, 6)).toMatchObject({ formula: 'B2*2', needsRecalc: true });

      // Toujours postérieures au dernier téléchargement : encore listées, cette fois écrasées.
      const again = await reimportPreview(stockFile);
      expect(again.lostValidations).toHaveLength(2);
      expectStatus(await confirmReimport(again.reimportToken, 'overwrite'), 204);
      expect(await staged(2, 2)).toMatchObject({ valueText: '10' });
      expect(await staged(2, 6)).toBeNull();

      // Téléchargées, elles ne peuvent plus être perdues.
      await editCell(2, 2, '20', { display: '10', formula: null });
      await download();
      expect((await reimportPreview(stockFile)).lostValidations).toEqual([]);
    });
  });

  describe('Tableau', () => {
    it('pagination, tri et recherche côté backend ; pageSize plafonné à 200', async () => {
      const block = table();
      await publishPage([block]);
      const first = await rows<TableRow>(kira, block.id, '?pageSize=2');
      expect(first.total).toBe(4);
      expect(first.items.map((r) => r.cells[0]!.value)).toEqual(['Épée', 'Bouclier']);

      const sorted = await rows<TableRow>(kira, block.id, '?sort=1:desc');
      expect(sorted.items.map((r) => r.cells[0]!.value)).toEqual([
        'Potion',
        'Épée',
        'Arc',
        'Bouclier',
      ]);
      const found = await rows<TableRow>(kira, block.id, '?q=bou');
      expect(found.items.map((r) => r.cells[0]!.value)).toEqual(['Bouclier']);

      expect((await kira.get(`/blocks/${block.id}/rows?pageSize=201`)).status).toBe(400);
    });

    it('une plage extensible suit la dernière ligne remplie', async () => {
      const block = table();
      await publishPage([block]);
      await prisma.stagingCell.create({
        data: {
          sourceId: source.id,
          sheet: SHEET,
          row: 9,
          col: 1,
          valueType: 'text',
          valueText: 'Hache',
        },
      });
      const all = await rows<TableRow>(kira, block.id);
      expect(all.total).toBe(5);
      expect(all.items.at(-1)!.cells[0]!.value).toBe('Hache');

      const fixed = table({ range: { mode: 'fixed', ref: 'A1:C3' } });
      await publishPage([fixed]);
      expect((await rows<TableRow>(kira, fixed.id)).total).toBe(2);
    });

    it('en-têtes du document, valeurs formatées ; aucune formule évaluée', async () => {
      const block = table({
        columns: [
          { col: 'A', visible: true, label: '', format: 'text' },
          { col: 'E', visible: true, label: '', format: 'number' },
        ],
        range: { mode: 'fixed', ref: 'A1:E2' },
      });
      const pageId = await publishPage([block]);
      const page = (await kira.get(`/pages/${pageId}`)).body as AssembledPage;
      const assembled = page.zones.main![0]!.columns[0]!.block!;
      expect(assembled.type === 'table' && assembled.config.columns).toEqual([
        { label: 'Produit', format: 'text' },
        { label: 'Trésor', format: 'number' },
      ]);
      const { items } = await rows<TableRow>(kira, block.id);
      expect(items[0]!.cells[1]).toEqual({ value: '99', needsRecalc: false });
    });

    it('lignes illisibles → 404 pour qui ne peut pas lire la page', async () => {
      const block = table();
      await publishPage([block]);
      const bob = await userClient(app, admin, 'bob');
      expect((await bob.get(`/blocks/${block.id}/rows`)).status).toBe(404);
      expect((await kira.get(`/blocks/${uid()}/rows`)).status).toBe(404);
    });
  });

  describe('Catalogue', () => {
    it('images : médiathèque, lien web, ou image par défaut si introuvable', async () => {
      const media = await admin.upload('/admin/media', PNG, 'epee.png');
      expectStatus(media, 201);
      const block = catalog();
      const pageId = await publishPage([block]);
      const page = (await kira.get(`/pages/${pageId}`)).body as AssembledPage;
      const assembled = page.zones.main![0]!.columns[0]!.block!;
      expect(assembled.type === 'catalog' && assembled.config.detailLabels).toEqual(['Quantité']);

      const { items } = await rows<CatalogCard>(kira, block.id);
      expect(items.map((c) => c.image)).toEqual([
        `/api/v1/media/${media.body.id}`,
        'https://ex.org/bouclier.png',
        null,
        null,
      ]);
      expect(items[0]).toMatchObject({ title: { value: 'Épée' }, details: [{ value: '10' }] });
    });
  });

  describe('Contenu libre', () => {
    it('valeurs résolues côté backend, avec needsRecalc', async () => {
      const block = rich('B2');
      const pageId = await publishPage([block]);
      await prisma.stagingCell.update({
        where: { sourceId_sheet_row_col: { sourceId: source.id, sheet: SHEET, row: 2, col: 2 } },
        data: { needsRecalc: true },
      });
      const page = (await kira.get(`/pages/${pageId}`)).body as AssembledPage;
      const assembled = page.zones.main![0]!.columns[0]!.block!;
      expect(assembled.type === 'rich_content' && assembled.config).toEqual({
        html: '<p>Valeur : <span data-value="0"></span></p>',
        values: [{ value: '10', needsRecalc: true }],
      });
    });

    it('liaison inter-fichiers suivie par cell_references, jamais par chemin', async () => {
      const bilan = await upload(
        withExternalLink(
          await buildXlsx({
            [SHEET]: {
              // Valeur stockée périmée : c'est la cellule liée qui fait foi.
              B2: { formula: `[1]${SHEET}!B3`, result: 1 },
              B3: { formula: `[1]${SHEET}!B3*2`, result: 8 },
            },
          }),
          'file:///C:/Users/nadia/Documents/stock.xlsx',
        ),
        'bilan.xlsx',
      );
      const references = await prisma.cellReference.findMany({ where: { sourceId: bilan.id } });
      expect(references).toHaveLength(2);
      expect(references[0]).toMatchObject({
        referencedSourceId: source.id,
        referencedSheet: SHEET,
        referencedRange: 'B3',
      });

      const linked = rich('B2', bilan.id);
      const computed = rich('B3', bilan.id);
      const pageId = await publishPage([linked, computed]);
      const page = (await kira.get(`/pages/${pageId}`)).body as AssembledPage;
      const values = page.zones.main!.map((r) => {
        const b = r.columns[0]!.block!;
        return b.type === 'rich_content' ? b.config.values[0]!.value : null;
      });
      // B2 suit la liaison (Bouclier : 4) ; B3 est un calcul, sa valeur stockée reste.
      expect(values).toEqual(['4', '8']);
    });
  });

  describe('source injoignable', () => {
    it('page renvoyée quand même, bloc en erreur, source listée pour l’admin seul', async () => {
      const block = table();
      const text = rich('B2');
      const pageId = await publishPage([block, text]);
      await prisma.source.update({ where: { id: source.id }, data: { status: 'unavailable' } });

      const res = await kira.get(`/pages/${pageId}`);
      expect(res.status).toBe(200);
      const page = res.body as AssembledPage;
      expect(
        page.zones.main!.map((r) => (r.columns[0]!.block as { error?: string }).error),
      ).toEqual(['SOURCE_UNAVAILABLE', 'SOURCE_UNAVAILABLE']);
      expect(page.unavailableSources).toEqual([]);

      const preview = (await admin.get(`/admin/pages/${pageId}/preview`)).body as AssembledPage;
      expect(preview.unavailableSources).toEqual([{ id: source.id, name: 'stock.xlsx' }]);

      const rowsRes = await kira.get(`/blocks/${block.id}/rows`);
      expect(rowsRes.status).toBe(503);
      expect(rowsRes.body.code).toBe('SOURCE_UNAVAILABLE');
    });
  });

  describe('aucun accès direct au document', () => {
    it('ni source, ni feuille, ni cellule dans les réponses destinées aux utilisateurs', async () => {
      const t = table();
      const c = catalog();
      const r = rich('B2');
      const pageId = await publishPage([t, c, r]);
      const responses = [
        (await kira.get(`/pages/${pageId}`)).body,
        await rows(kira, t.id),
        await rows(kira, c.id),
      ].map((body) => JSON.stringify(body));
      for (const body of responses) {
        expect(body).not.toContain(source.id);
        expect(body).not.toContain(SHEET);
        expect(body).not.toContain('stock.xlsx');
        expect(body).not.toMatch(/"(?:sourceId|sheet|range|col|ref)"/);
        expect(body).not.toMatch(/\b[A-E][1-9]\b/);
      }
    });

    it('aperçu admin : lignes du brouillon par la route admin', async () => {
      const block = table();
      const page = (await admin.send('post', '/admin/pages', { name: 'Brouillon' }))
        .body as AdminPage;
      await admin.send('put', `/admin/pages/${page.id}/draft`, {
        name: 'Brouillon',
        config: { zones: { main: [rowOf(block)], sidebar: null } },
        version: page.version,
      });
      const preview = (await admin.get(`/admin/pages/${page.id}/preview`)).body as AssembledPage;
      const assembled = preview.zones.main![0]!.columns[0]!.block!;
      expect(assembled.type === 'table' && assembled.rowsUrl).toBe(
        `/api/v1/admin/blocks/${block.id}/rows`,
      );
      const res = await admin.get(`/admin/blocks/${block.id}/rows`);
      expect(res.body.total).toBe(4);
      expect((await kira.get(`/blocks/${block.id}/rows`)).status).toBe(404);
    });
  });
});
