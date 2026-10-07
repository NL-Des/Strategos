import type { NestExpressApplication } from '@nestjs/platform-express';
import type {
  AdminPage,
  AssembledPage,
  Block,
  BulkValidateResult,
  FormDefinition,
  FormField,
  FormMode,
  Paginated,
  PublishPreview,
  Row,
  SaveFormDraftResult,
  SavePageDraftResult,
  SourceSummary,
  Submission,
  SubmissionQueueItem,
  TableRow,
  UserForm,
} from '@strategos/shared';
import { PrismaService } from '../src/prisma/prisma.service.js';
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
import { buildXlsx, withExternalLink } from './xlsx.js';

/** Noms internes : ils ne doivent jamais apparaître côté utilisateur. */
const SHEET = 'FeuilleInterne';
const INSCRIPTIONS = 'Inscriptions';
const REF = 'Référentiels';

/**
 * Stock (clé en A, quantité en C, valeur = quantité × prix en E), trésor en G2
 * dont dépendent G3 puis G4, inscriptions (zone d'ajout à partir de la ligne 3)
 * et référentiel des classes.
 */
export function workbook() {
  return buildXlsx({
    [SHEET]: {
      A1: 'Référence',
      B1: 'Produit',
      C1: 'Quantité',
      D1: 'Prix',
      E1: 'Valeur',
      A2: 101,
      B2: 'Épée',
      C2: 8,
      D2: 25,
      E2: { formula: 'C2*D2', result: 200 },
      A3: 137,
      B3: 'Bouclier',
      C3: 5,
      D3: 40,
      E3: { formula: 'C3*D3', result: 200 },
      A4: 150,
      B4: 'Arc',
      C4: 'n/a',
      D4: 30,
      G1: 'Trésor',
      G2: 100,
      G3: { formula: 'G2*2', result: 200 },
      G4: { formula: 'G3+1', result: 201 },
    },
    [INSCRIPTIONS]: { A1: 'Pseudo', B1: 'Classe', C1: 'Niveau', A2: 'Zed', B2: 'Mage', C2: 10 },
    [REF]: { A1: 'Mage', A2: 'Voleur', A3: 'Guerrier' },
  });
}

const field = (over: Partial<FormField>): FormField => ({
  key: 'x',
  label: 'X',
  help: '',
  type: 'text',
  required: false,
  ...over,
});

const rowOf = (block: Block): Row => ({ id: uid(), columns: [{ width: '1/1', block }] });

interface FormSpec {
  mode: FormMode;
  def: (blocks: Block[]) => FormDefinition;
}

describe('Formulaires et soumissions (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: TestClient;
  let kira: TestClient;
  let paul: TestClient;
  let source: SourceSummary;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    admin = await adminClient(app);
    kira = await userClient(app, admin, 'kira');
    paul = await userClient(app, admin, 'paul');
    const res = await admin.upload('/admin/sources/upload', await workbook(), 'stock.xlsx');
    expectStatus(res, 201);
    source = res.body as SourceSummary;
  });

  afterAll(async () => {
    await app.close();
  });

  // Définitions de référence.

  const inscription = (): FormDefinition => ({
    title: 'Inscription',
    intro: 'Tournoi',
    successMessage: 'Merci',
    sourceId: source.id,
    sheet: INSCRIPTIONS,
    startRow: 3,
    maxNewRows: 3,
    fields: [
      field({ key: 'pseudo', label: 'Pseudo', col: 'A', auto: 'pseudo' }),
      field({
        key: 'classe',
        label: 'Classe',
        col: 'B',
        type: 'select',
        required: true,
        options: { kind: 'range', sourceId: source.id, sheet: REF, range: 'A1:A3' },
      }),
      field({
        key: 'niveau',
        label: 'Niveau',
        col: 'C',
        type: 'number',
        required: true,
        min: 1,
        max: 60,
      }),
    ],
  });

  const tresor = (cell = 'G2'): FormDefinition => ({
    title: 'Trésor',
    intro: '',
    successMessage: '',
    sourceId: source.id,
    sheet: SHEET,
    fields: [field({ key: 'or', label: 'Or', cell, type: 'number', required: true })],
  });

  const stockLine =
    (movement = true) =>
    (blocks: Block[]): FormDefinition => ({
      title: 'Stock',
      intro: '',
      successMessage: '',
      sourceId: source.id,
      sheet: SHEET,
      rowStart: 2,
      rowEnd: null,
      keyCol: 'A',
      linkedBlockId: blocks.find((b) => b.type === 'table')!.id,
      fields: [
        field({ key: 'qte', label: 'Quantité', col: 'C', type: 'number', movement }),
        field({ key: 'note', label: 'Note', col: 'F' }),
      ],
    });

  const table = (range: object = { mode: 'extensible', columns: 'A:E', startRow: 1 }): Block => ({
    id: uid(),
    type: 'table',
    config: {
      sourceId: source.id,
      sheet: SHEET,
      range: range as never,
      headerRow: true,
      columns: [
        { col: 'A', visible: true, label: '', format: 'text' },
        { col: 'C', visible: true, label: '', format: 'number' },
      ],
      pageSize: 10,
      sortable: true,
      searchable: true,
    },
  });

  // Outils.

  async function savePage(pageId: string, blocks: Block[]): Promise<SavePageDraftResult> {
    const page = (await admin.get(`/admin/pages/${pageId}`)).body as AdminPage;
    const res = await admin.send('put', `/admin/pages/${pageId}/draft`, {
      name: page.name,
      config: {
        zones: { main: blocks.map(rowOf), sidebar: null },
        themeId: null,
        showHeader: true,
        showFooter: true,
        showSidebar: false,
      },
      version: page.version,
    });
    expectStatus(res, 200);
    return res.body as SavePageDraftResult;
  }

  /** Page publiée, lisible par Kira et Paul, avec ces formulaires (et autres modules). */
  async function buildPage(forms: FormSpec[], blocks: Block[] = []) {
    const page = (await admin.send('post', '/admin/pages', { name: 'Tournoi' })).body as AdminPage;
    const created: { id: string; blockId: string; spec: FormSpec }[] = [];
    for (const spec of forms) {
      const blockId = uid();
      const res = await admin.send('post', '/admin/forms', {
        pageId: page.id,
        pageBlockId: blockId,
        mode: spec.mode,
      });
      expectStatus(res, 201);
      created.push({ id: res.body.id as string, blockId, spec });
    }
    const all: Block[] = [
      ...blocks,
      ...created.map((c) => ({ id: c.blockId, type: 'form' as const, config: { formId: c.id } })),
    ];
    await savePage(page.id, all);
    const drafts: SaveFormDraftResult[] = [];
    for (const c of created) {
      const res = await admin.send('put', `/admin/forms/${c.id}/draft`, {
        version: 1,
        definition: c.spec.def(all),
      });
      expectStatus(res, 200);
      drafts.push(res.body as SaveFormDraftResult);
    }
    expectStatus(await admin.send('post', `/admin/pages/${page.id}/publish`, {}), 200);
    await createGroup(admin, `Lecteurs ${page.id.slice(-4)}`, {
      userIds: [await meId(kira), await meId(paul)],
      pageIds: [page.id],
    });
    return { pageId: page.id, formIds: created.map((c) => c.id), blocks: all, drafts };
  }

  const submit = (client: TestClient, formId: string, values: object, rowKey?: string) =>
    client.send('post', `/forms/${formId}/submissions`, { values, ...(rowKey ? { rowKey } : {}) });

  async function submitted(client: TestClient, formId: string, values: object, rowKey?: string) {
    const res = await submit(client, formId, values, rowKey);
    expectStatus(res, 201);
    return res.body as Submission;
  }

  const validate = (id: string, body: object = {}) =>
    admin.send('post', `/admin/submissions/${id}/validate`, body);

  const staged = (sheet: string, row: number, col: number) =>
    prisma.stagingCell.findUnique({
      where: { sourceId_sheet_row_col: { sourceId: source.id, sheet, row, col } },
    });

  async function snapshot(): Promise<Map<string, string>> {
    const cells = await prisma.stagingCell.findMany({ where: { sourceId: source.id } });
    return new Map(
      cells.map((c) => [
        `${c.sheet}!${c.row}:${c.col}`,
        `${c.valueType}|${c.valueText}|${c.formula}`,
      ]),
    );
  }

  function changed(before: Map<string, string>, after: Map<string, string>): string[] {
    const keys = new Set([...before.keys(), ...after.keys()]);
    return [...keys].filter((k) => before.get(k) !== after.get(k)).sort();
  }

  describe('formulaire côté utilisateur', () => {
    it('définition sans cellule ni source, champs automatiques et options lues dans une plage', async () => {
      const { formIds } = await buildPage([{ mode: 'ajout', def: inscription }]);
      const res = await kira.get(`/forms/${formIds[0]}`);
      expectStatus(res, 200);
      const form = res.body as UserForm;
      expect(form).toMatchObject({ mode: 'ajout', state: 'open', title: 'Inscription' });
      expect(form.fields[0]).toMatchObject({
        key: 'pseudo',
        auto: 'pseudo',
        readOnly: true,
        value: 'kira',
      });
      expect(form.fields[1]!.options).toEqual(['Mage', 'Voleur', 'Guerrier']);
      const json = JSON.stringify(form);
      for (const secret of [source.id, SHEET, INSCRIPTIONS, REF, '"col"', '"cell"']) {
        expect(json).not.toContain(secret);
      }
    });

    it('champs automatiques remplis par le serveur ; une valeur envoyée pour eux est ignorée', async () => {
      const { formIds } = await buildPage([{ mode: 'ajout', def: inscription }]);
      const s = await submitted(kira, formIds[0]!, { pseudo: 'Paul', classe: 'Mage', niveau: 42 });
      expect(s).toMatchObject({
        status: 'pending',
        values: { pseudo: 'kira', classe: 'Mage', niveau: 42 },
      });
    });

    it('règles de validation : obligatoire, option, bornes', async () => {
      const { formIds } = await buildPage([{ mode: 'ajout', def: inscription }]);
      const res = await submit(kira, formIds[0]!, { classe: 'Druide', niveau: 61 });
      expect(res.status).toBe(400);
      expect(res.body.details.fields).toEqual({
        'values.classe': ['isIn'],
        'values.niveau': ['max'],
      });
    });

    it('formulaire non configuré, ou page illisible → 404 ; absent de la page assemblée', async () => {
      const incomplete = (): FormDefinition => ({ ...tresor(), fields: [field({ key: 'or' })] });
      const { pageId, formIds } = await buildPage([
        { mode: 'modification', def: incomplete },
        { mode: 'modification', def: () => tresor() },
      ]);
      expect((await kira.get(`/forms/${formIds[0]}`)).status).toBe(404);
      expect((await submit(kira, formIds[0]!, { or: 1 })).status).toBe(404);
      const page = (await kira.get(`/pages/${pageId}`)).body as AssembledPage;
      const blocks = page.zones.main!.map((r) => r.columns[0]!.block);
      expect(blocks).toEqual([
        null,
        expect.objectContaining({
          type: 'form',
          config: {
            formId: formIds[1],
            formUrl: `/api/v1/forms/${formIds[1]}`,
            submitUrl: `/api/v1/forms/${formIds[1]}/submissions`,
          },
        }),
      ]);
      const intrus = await userClient(app, admin, 'intrus');
      expect((await intrus.get(`/forms/${formIds[1]}`)).status).toBe(404);
      expect((await submit(intrus, formIds[1]!, { or: 1 })).status).toBe(404);
    });

    it('fermeture et date limite immédiates : état « closed », 422 FORM_CLOSED', async () => {
      const { formIds } = await buildPage([{ mode: 'modification', def: () => tresor() }]);
      const id = formIds[0]!;
      const pending = await submitted(kira, id, { or: 5 });
      expectStatus(await admin.send('post', `/admin/forms/${id}/close`), 200);
      expect(((await kira.get(`/forms/${id}`)).body as UserForm).state).toBe('closed');
      const closed = await submit(kira, id, { or: 6 });
      expect(closed.status).toBe(422);
      expect(closed.body.code).toBe('FORM_CLOSED');
      // Les soumissions déjà en attente restent validables.
      expectStatus(await validate(pending.id), 200);

      expectStatus(await admin.send('post', `/admin/forms/${id}/open`), 200);
      const past = new Date(Date.now() - 60_000).toISOString();
      expectStatus(
        await admin.send('patch', `/admin/forms/${id}/settings`, { closesAt: past }),
        200,
      );
      expect((await submit(kira, id, { or: 6 })).body.code).toBe('FORM_CLOSED');
      expectStatus(
        await admin.send('patch', `/admin/forms/${id}/settings`, { closesAt: null }),
        200,
      );
      expectStatus(await submit(kira, id, { or: 6 }), 201);
      expect(
        await prisma.auditLog.count({ where: { action: 'form.settings', targetId: id } }),
      ).toBe(4);
    });

    it('« mes soumissions » : les siennes seulement', async () => {
      const { formIds } = await buildPage([{ mode: 'modification', def: () => tresor() }]);
      const mine = await submitted(kira, formIds[0]!, { or: 5 });
      await submitted(paul, formIds[0]!, { or: 7 });
      const list = (await kira.get('/me/submissions')).body as Paginated<Submission>;
      expect(list.total).toBe(1);
      expect(list.items[0]).toMatchObject({ id: mine.id, formTitle: 'Trésor', status: 'pending' });
      expectStatus(await kira.get(`/me/submissions/${mine.id}`), 200);
      expect((await paul.get(`/me/submissions/${mine.id}`)).status).toBe(404);
    });
  });

  it('source utilisée par un formulaire seulement → retrait averti, avec sa page', async () => {
    const { pageId } = await buildPage([{ mode: 'ajout', def: inscription }]);
    const res = await admin.send('delete', `/admin/sources/${source.id}`, {});
    expect(res.status).toBe(409);
    expect(res.body.details.warnings[0]).toMatchObject({
      code: 'SOURCE_IN_USE',
      pages: [{ id: pageId, name: 'Tournoi' }],
    });
  });

  describe("formulaire d'ajout", () => {
    it("ligne calculée à la validation ; une ligne remplie à la main n'est jamais écrasée", async () => {
      const { formIds } = await buildPage([{ mode: 'ajout', def: inscription }]);
      const first = await submitted(kira, formIds[0]!, { classe: 'Mage', niveau: 12 });
      const second = await submitted(paul, formIds[0]!, { classe: 'Voleur', niveau: 20 });
      // Entre-temps, l'admin remplit la ligne 3 directement dans le document.
      await prisma.stagingCell.create({
        data: {
          sourceId: source.id,
          sheet: INSCRIPTIONS,
          row: 3,
          col: 2,
          valueType: 'text',
          valueText: 'Druide',
        },
      });
      expectStatus(await validate(second.id), 200);
      expectStatus(await validate(first.id), 200);
      const rows = await prisma.submission.findMany({ orderBy: { createdAt: 'asc' } });
      expect(rows.map((r) => r.assignedRow)).toEqual([5, 4]);
      expect(await staged(INSCRIPTIONS, 3, 2)).toMatchObject({ valueText: 'Druide' });
      expect(await staged(INSCRIPTIONS, 4, 1)).toMatchObject({ valueText: 'paul' });
      expect(await staged(INSCRIPTIONS, 5, 3)).toMatchObject({
        valueType: 'number',
        valueText: '12',
      });
      expect(((await kira.get(`/me/submissions/${first.id}`)).body as Submission).status).toBe(
        'validated',
      );
    });

    it('zone pleine → 422 ADD_ZONE_FULL, la soumission reste pending et refusable ; formulaire complet', async () => {
      const { formIds } = await buildPage([{ mode: 'ajout', def: inscription }]);
      const subs = [];
      for (const niveau of [1, 2, 3, 4]) {
        subs.push(await submitted(kira, formIds[0]!, { classe: 'Mage', niveau }));
      }
      for (const s of subs.slice(0, 3)) expectStatus(await validate(s.id), 200);
      const full = await validate(subs[3]!.id);
      expect(full.status).toBe(422);
      expect(full.body.code).toBe('ADD_ZONE_FULL');
      expect(await prisma.submission.findUnique({ where: { id: subs[3]!.id } })).toMatchObject({
        status: 'pending',
      });
      expect(((await kira.get(`/forms/${formIds[0]}`)).body as UserForm).state).toBe('full');
      expect((await submit(kira, formIds[0]!, { classe: 'Mage', niveau: 5 })).body.code).toBe(
        'FORM_FULL',
      );
      const rejected = await admin.send('post', `/admin/submissions/${subs[3]!.id}/reject`, {
        reason: 'Complet',
      });
      expectStatus(rejected, 200);
      expect(rejected.body).toMatchObject({ status: 'rejected', reason: 'Complet' });
      expect((await validate(subs[3]!.id)).body.code).toBe('SUBMISSION_NOT_PENDING');
    });

    it('deux validations simultanées ne prennent pas la même ligne', async () => {
      const { formIds } = await buildPage([{ mode: 'ajout', def: inscription }]);
      const a = await submitted(kira, formIds[0]!, { classe: 'Mage', niveau: 1 });
      const b = await submitted(paul, formIds[0]!, { classe: 'Voleur', niveau: 2 });
      const results = await Promise.all([validate(a.id), validate(b.id)]);
      results.forEach((r) => expectStatus(r, 200));
      const rows = (await prisma.submission.findMany()).map((s) => s.assignedRow).sort();
      expect(rows).toEqual([3, 4]);
    });

    it("avertissement : un tableau à plage fixe ne couvre pas la zone d'ajout", async () => {
      const fixed = { ...table({ mode: 'fixed', ref: 'A1:E4' }) };
      (fixed.config as { sheet: string }).sheet = INSCRIPTIONS;
      const { pageId, drafts, blocks } = await buildPage(
        [{ mode: 'ajout', def: inscription }],
        [fixed],
      );
      expect(drafts[0]!.warnings).toEqual([
        expect.objectContaining({
          code: 'ADD_ZONE_NOT_COVERED',
          items: [{ form: 'Inscription', page: 'Tournoi' }],
        }),
      ]);
      const saved = await savePage(pageId, blocks);
      expect(saved.warnings.map((w) => w.code)).toEqual(['ADD_ZONE_NOT_COVERED']);
    });

    it('même avertissement pour un tableau à plage fixe du header', async () => {
      const fixed = { ...table({ mode: 'fixed', ref: 'A1:E4' }) };
      (fixed.config as { sheet: string }).sheet = INSCRIPTIONS;
      const header = (await admin.get('/admin/layout/header/draft')).body as { version: number };
      const saveHeader = await admin.send('put', '/admin/layout/header/draft', {
        config: { rows: [rowOf(fixed)] },
        version: header.version,
      });
      expectStatus(saveHeader, 200);
      expect(saveHeader.body.warnings).toEqual([]);

      const { drafts } = await buildPage([{ mode: 'ajout', def: inscription }]);
      expect(drafts[0]!.warnings).toEqual([
        expect.objectContaining({
          code: 'ADD_ZONE_NOT_COVERED',
          items: [{ form: 'Inscription', page: '', layout: 'header' }],
        }),
      ]);
      const again = await admin.send('put', '/admin/layout/header/draft', {
        config: { rows: [rowOf(fixed)] },
        version: header.version + 1,
      });
      expect(again.body.warnings).toEqual([
        expect.objectContaining({
          code: 'ADD_ZONE_NOT_COVERED',
          items: [{ form: 'Inscription', page: '', layout: 'header' }],
        }),
      ]);
    });
  });

  describe('formulaire de ligne', () => {
    it('relié à un tableau : clés des lignes, pré-remplissage, ligne retrouvée par sa clé', async () => {
      const t = table();
      const { pageId, formIds } = await buildPage([{ mode: 'ligne', def: stockLine(false) }], [t]);
      const page = (await kira.get(`/pages/${pageId}`)).body as AssembledPage;
      const [tableBlock, formBlock] = page.zones.main!.map((r) => r.columns[0]!.block);
      expect(formBlock).toBeNull();
      expect(tableBlock).toMatchObject({
        type: 'table',
        rowForms: [{ formId: formIds[0], title: 'Stock', formUrl: `/api/v1/forms/${formIds[0]}` }],
      });
      const rowsRes = await kira.get(`/blocks/${t.id}/rows`);
      expectStatus(rowsRes, 200);
      const rows = rowsRes.body as Paginated<TableRow>;
      expect(rows.items.map((r) => r.rowKeys)).toEqual([
        { [formIds[0]!]: '101' },
        { [formIds[0]!]: '137' },
        { [formIds[0]!]: '150' },
      ]);
      const prefill = await kira.get(`/forms/${formIds[0]}/prefill?rowKey=137`);
      expectStatus(prefill, 200);
      expect(prefill.body).toEqual({ values: { qte: 5, note: null } });
      expect((await kira.get(`/forms/${formIds[0]}/prefill?rowKey=999`)).body.code).toBe(
        'ROW_KEY_NOT_FOUND',
      );

      const s = await submitted(kira, formIds[0]!, { qte: 3, note: 'abîmé' }, '137');
      // L'admin insère une ligne au-dessus : la clé suit le produit.
      await prisma.$executeRaw`UPDATE staging_cells SET row = row + 10 WHERE source_id = ${source.id}::uuid AND sheet = ${SHEET} AND row = 3`;
      expectStatus(await validate(s.id, { confirm: true }), 200);
      expect(await staged(SHEET, 13, 3)).toMatchObject({ valueText: '3' });
      expect(await staged(SHEET, 13, 6)).toMatchObject({ valueText: 'abîmé' });
    });

    it('clé absente ou en double, mouvement sur une valeur non numérique', async () => {
      const { formIds } = await buildPage([{ mode: 'ligne', def: stockLine() }], [table()]);
      const id = formIds[0]!;
      const missing = await submit(kira, id, { qte: 1 }, '999');
      expect(missing.status).toBe(422);
      expect(missing.body.code).toBe('ROW_KEY_NOT_FOUND');

      const dup = await submitted(kira, id, { qte: -1 }, '101');
      await prisma.stagingCell.create({
        data: {
          sourceId: source.id,
          sheet: SHEET,
          row: 5,
          col: 1,
          valueType: 'number',
          valueText: '101',
          valueNumber: 101,
        },
      });
      const duplicate = await validate(dup.id);
      expect(duplicate.status).toBe(422);
      expect(duplicate.body.code).toBe('ROW_KEY_DUPLICATE');

      const arc = await submitted(kira, id, { qte: -1 }, '150');
      const notNumeric = await validate(arc.id);
      expect(notNumeric.status).toBe(422);
      expect(notNumeric.body.code).toBe('MOVEMENT_NOT_NUMERIC');
      expect(await prisma.submission.count({ where: { status: 'pending' } })).toBe(2);
    });

    it('mouvements : −3 et −1 validés en même temps donnent 4, sans conflit ; journal avant/après', async () => {
      const { formIds } = await buildPage([{ mode: 'ligne', def: stockLine() }], [table()]);
      const julie = await submitted(kira, formIds[0]!, { qte: -3 }, '101');
      const paulMove = await submitted(paul, formIds[0]!, { qte: -1 }, '101');
      const queue = (await admin.get('/admin/submissions?status=pending'))
        .body as Paginated<SubmissionQueueItem>;
      expect(queue.items.map((i) => i.conflicts)).toEqual([[], []]);
      expect(queue.items[0]!.targets[0]).toMatchObject({
        field: 'qte',
        cell: 'C2',
        currentValue: '8',
        proposed: -3,
        movement: true,
      });
      const results = await Promise.all([
        validate(julie.id, { confirm: true }),
        validate(paulMove.id, { confirm: true }),
      ]);
      results.forEach((r) => expectStatus(r, 200));
      expect(await staged(SHEET, 2, 3)).toMatchObject({ valueText: '4' });
      // E2 = C2 × D2 dépend de la cellule écrite : « à recalculer ».
      expect(await staged(SHEET, 2, 5)).toMatchObject({ needsRecalc: true, formula: 'C2*D2' });

      const entries = await prisma.auditLog.findMany({
        where: { action: 'submission.validate' },
        orderBy: { createdAt: 'asc' },
      });
      const cells = entries.map((e) => (e.after as { cells: object[] }).cells[0]);
      expect(cells).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ cell: `${SHEET}!C2`, movement: -3 }),
          expect.objectContaining({ cell: `${SHEET}!C2`, movement: -1 }),
        ]),
      );
      expect(cells.map((c) => (c as { after: string }).after)).toContain('4');
      expect(entries[0]!.after).toMatchObject({ source: { id: source.id, name: 'stock.xlsx' } });
    });
  });

  describe('formulaire de modification', () => {
    it('valeurs absolues sur la même cellule : conflit visible, compteur', async () => {
      const { formIds } = await buildPage([{ mode: 'modification', def: () => tresor() }]);
      const a = await submitted(kira, formIds[0]!, { or: 150 });
      const b = await submitted(paul, formIds[0]!, { or: 90 });
      expect((await admin.get('/admin/submissions/count')).body).toEqual({ count: 2 });
      const queue = (await admin.get('/admin/submissions')).body as Paginated<SubmissionQueueItem>;
      expect(queue.items.map((i) => [i.submission.id, i.conflicts])).toEqual([
        [a.id, [b.id]],
        [b.id, [a.id]],
      ]);
      expect(queue.items[0]).toMatchObject({
        user: { username: 'kira' },
        form: { title: 'Trésor', mode: 'modification' },
        targets: [{ cell: 'G2', currentValue: '100', proposed: 150 }],
      });
      expect((await kira.get('/admin/submissions')).status).toBe(404);
    });

    it("aucune écriture hors des cellules du formulaire ; valeurs corrigées par l'admin → modified", async () => {
      const { formIds } = await buildPage([{ mode: 'modification', def: () => tresor() }]);
      const s = await submitted(kira, formIds[0]!, { or: 150, intrus: 'x', G5: 1 });
      expect(s.values).toEqual({ or: 150 });
      const before = await snapshot();
      const res = await admin.send('post', `/admin/submissions/${s.id}/modify`, {
        values: { or: 120, autre: 3 },
      });
      expectStatus(res, 200);
      expect(res.body.status).toBe('modified');
      expect(changed(before, await snapshot())).toEqual([`${SHEET}!2:7`]);
      expect(await staged(SHEET, 2, 7)).toMatchObject({ valueText: '120' });
      // G3 et G4 dépendent de G2, directement puis transitivement.
      expect((await staged(SHEET, 3, 7))!.needsRecalc).toBe(true);
      expect((await staged(SHEET, 4, 7))!.needsRecalc).toBe(true);
      expect((await staged(SHEET, 2, 5))!.needsRecalc).toBe(false);
      const entry = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'submission.modify' },
      });
      expect(entry.after).toMatchObject({
        status: 'modified',
        cells: [{ cell: `${SHEET}!G2`, before: '100', after: '120' }],
      });
    });

    it('cellule-formule ciblée : avertie à la création, 409 à la validation, puis écrasée', async () => {
      const { formIds, drafts } = await buildPage([
        { mode: 'modification', def: () => tresor('G3') },
      ]);
      expect(drafts[0]!.warnings).toEqual([
        expect.objectContaining({ code: 'FORMULA_CELL_TARGETED', cells: [`${SHEET}!G3`] }),
      ]);
      const s = await submitted(kira, formIds[0]!, { or: 7 });
      const queue = (await admin.get('/admin/submissions')).body as Paginated<SubmissionQueueItem>;
      expect(queue.items[0]!.warnings[0]).toMatchObject({ code: 'FORMULA_CELL_TARGETED' });
      const warned = await validate(s.id);
      expect(warned.status).toBe(409);
      expect(warned.body.code).toBe('CONFIRMATION_REQUIRED');
      expect(warned.body.details.warnings[0].cells).toEqual([`${SHEET}!G3`]);
      expectStatus(await validate(s.id, { confirm: true }), 200);
      expect(await staged(SHEET, 3, 7)).toMatchObject({ formula: null, valueText: '7' });
      expect((await staged(SHEET, 4, 7))!.needsRecalc).toBe(true);
    });

    it('needs_recalc suit les liaisons vers un autre classeur', async () => {
      const bilan = await admin.upload(
        '/admin/sources/upload',
        withExternalLink(
          await buildXlsx({
            Bilan: {
              A1: { formula: `[1]${SHEET}!G2`, result: 100 },
              B1: { formula: 'A1*2', result: 200 },
            },
          }),
          'file:///C:/stock.xlsx',
        ),
        'bilan.xlsx',
      );
      expectStatus(bilan, 201);
      const { formIds } = await buildPage([{ mode: 'modification', def: () => tresor() }]);
      const s = await submitted(kira, formIds[0]!, { or: 1 });
      expectStatus(await validate(s.id), 200);
      const linked = await prisma.stagingCell.findMany({
        where: { sourceId: bilan.body.id as string },
        orderBy: { col: 'asc' },
      });
      expect(linked.map((c) => c.needsRecalc)).toEqual([true, true]);
    });
  });

  describe('validation groupée', () => {
    const validateMany = (ids: string[], confirm?: boolean) =>
      admin.send('post', '/admin/submissions/validate', { ids, confirm });

    it('de la plus ancienne à la plus récente ; formule à confirmer, id inconnu : les autres passent', async () => {
      const { formIds } = await buildPage([
        { mode: 'ajout', def: inscription },
        { mode: 'modification', def: () => tresor('G3') },
      ]);
      const first = await submitted(kira, formIds[0]!, { classe: 'Mage', niveau: 12 });
      const second = await submitted(paul, formIds[0]!, { classe: 'Voleur', niveau: 20 });
      const formula = await submitted(kira, formIds[1]!, { or: 7 });
      const unknown = uid();

      const res = await validateMany([formula.id, second.id, unknown, first.id]);
      expectStatus(res, 200);
      const result = res.body as BulkValidateResult;
      expect(result.validated).toEqual([first.id, second.id]);
      expect(result.failed).toEqual([{ id: unknown, code: 'NOT_FOUND' }]);
      expect(result.confirmationRequired).toEqual([
        {
          id: formula.id,
          warnings: [
            expect.objectContaining({ code: 'FORMULA_CELL_TARGETED', cells: [`${SHEET}!G3`] }),
          ],
        },
      ]);
      const rows = await prisma.submission.findMany({ orderBy: { createdAt: 'asc' } });
      expect(rows.map((r) => [r.status, r.assignedRow])).toEqual([
        ['validated', 3],
        ['validated', 4],
        ['pending', null],
      ]);
      expect((await staged(SHEET, 3, 7))!.formula).not.toBeNull();

      const replay = await validateMany([formula.id], true);
      expect(replay.body).toEqual({
        validated: [formula.id],
        confirmationRequired: [],
        failed: [],
      });
      expect(await staged(SHEET, 3, 7)).toMatchObject({ formula: null, valueText: '7' });
      // Une entrée de journal par soumission, comme pour une validation à l'unité.
      expect(await prisma.auditLog.count({ where: { action: 'submission.validate' } })).toBe(3);
    });

    it('un échec laisse la soumission en attente, avec son code ; déjà décidée → SUBMISSION_NOT_PENDING', async () => {
      const { formIds } = await buildPage([{ mode: 'ajout', def: inscription }]);
      const subs = [];
      for (const niveau of [1, 2, 3, 4]) {
        subs.push(await submitted(kira, formIds[0]!, { classe: 'Mage', niveau }));
      }
      expectStatus(await validate(subs[0]!.id), 200);
      const res = await validateMany(subs.map((s) => s.id));
      expectStatus(res, 200);
      expect(res.body).toEqual({
        validated: [subs[1]!.id, subs[2]!.id],
        confirmationRequired: [],
        failed: [
          { id: subs[0]!.id, code: 'SUBMISSION_NOT_PENDING' },
          { id: subs[3]!.id, code: 'ADD_ZONE_FULL' },
        ],
      });
      expect(await prisma.submission.count({ where: { status: 'pending' } })).toBe(1);
    });

    it('liste vide, doublon, trop longue ou mal formée → 400 ; réservée à l’admin', async () => {
      const id = uid();
      for (const ids of [[], [id, id], ['pas-un-uuid'], Array.from({ length: 101 }, uid)]) {
        const res = await validateMany(ids);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_FAILED');
      }
      expect((await kira.send('post', '/admin/submissions/validate', { ids: [id] })).status).toBe(
        404,
      );
    });
  });

  describe('publication', () => {
    it('seules les modifications structurelles invalident, avec leur nombre affiché avant', async () => {
      const { pageId, formIds } = await buildPage([{ mode: 'modification', def: () => tresor() }]);
      const id = formIds[0]!;
      const s = await submitted(kira, id, { or: 5 });

      // Libellé corrigé : rien n'est invalidé.
      const relabel = await admin.send('put', `/admin/forms/${id}/draft`, {
        version: 2,
        definition: {
          ...tresor(),
          title: 'Trésor de guilde',
          fields: [
            field({ key: 'or', label: 'Pièces', cell: 'G2', type: 'number', required: true }),
          ],
        },
      });
      expectStatus(relabel, 200);
      expect((relabel.body as SaveFormDraftResult).wouldInvalidate).toBe(0);
      // Rien ne change pour les utilisateurs avant la publication.
      expect(((await kira.get(`/forms/${id}`)).body as UserForm).title).toBe('Trésor');
      const preview = (await admin.get(`/admin/pages/${pageId}/publish/preview`))
        .body as PublishPreview;
      expect(preview).toEqual({
        forms: [{ id, title: 'Trésor de guilde', change: 'updated' }],
        invalidatedSubmissions: 0,
        spaces: [],
        chats: [],
      });
      expectStatus(await admin.send('post', `/admin/pages/${pageId}/publish`, {}), 200);
      expect(((await kira.get(`/forms/${id}`)).body as UserForm).title).toBe('Trésor de guilde');
      expect((await prisma.submission.findUniqueOrThrow({ where: { id: s.id } })).status).toBe(
        'pending',
      );

      // Cellule changée : une soumission serait invalidée.
      const moved = await admin.send('put', `/admin/forms/${id}/draft`, {
        version: 3,
        definition: tresor('G5'),
      });
      expect((moved.body as SaveFormDraftResult).wouldInvalidate).toBe(1);
      expect(
        ((await admin.get(`/admin/pages/${pageId}/publish/preview`)).body as PublishPreview)
          .invalidatedSubmissions,
      ).toBe(1);
      const warned = await admin.send('post', `/admin/pages/${pageId}/publish`, {});
      expect(warned.status).toBe(409);
      expect(warned.body.details.warnings[0]).toMatchObject({
        code: 'SUBMISSIONS_INVALIDATED',
        count: 1,
      });
      expectStatus(
        await admin.send('post', `/admin/pages/${pageId}/publish`, { confirm: true }),
        200,
      );
      expect((await kira.get(`/me/submissions/${s.id}`)).body as Submission).toMatchObject({
        status: 'invalidated',
        reason: 'form_changed',
      });

      // Formulaire retiré du brouillon : ses soumissions en attente sont invalidées.
      const again = await submitted(kira, id, { or: 6 });
      expectStatus(await admin.send('delete', `/admin/forms/${id}`), 204);
      expect((await kira.get(`/forms/${id}`)).status).toBe(200);
      expect(
        ((await admin.get(`/admin/pages/${pageId}/publish/preview`)).body as PublishPreview).forms,
      ).toEqual([{ id, title: 'Trésor', change: 'deleted' }]);
      expectStatus(
        await admin.send('post', `/admin/pages/${pageId}/publish`, { confirm: true }),
        200,
      );
      expect((await prisma.submission.findUniqueOrThrow({ where: { id: again.id } })).reason).toBe(
        'form_deleted',
      );
      expect((await kira.get(`/forms/${id}`)).status).toBe(404);
    });

    it('formulaire interdit dans le header partagé', async () => {
      const res = await admin.send('put', '/admin/layout/header/draft', {
        version: 1,
        config: { rows: [rowOf({ id: uid(), type: 'form', config: { formId: uid() } })] },
      });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('BLOCK_NOT_ALLOWED_IN_LAYOUT');
    });
  });

  describe('validation automatique', () => {
    it('même chemin : validée à la soumission, « système » au journal ; un échec reste pending', async () => {
      const { formIds } = await buildPage(
        [
          { mode: 'modification', def: () => tresor('G3') },
          { mode: 'ligne', def: stockLine() },
        ],
        [table()],
      );
      const [tresorId, stockId] = formIds as [string, string];
      // Cellule-formule : l'avertissement est donné à l'activation.
      const warned = await admin.send('patch', `/admin/forms/${tresorId}/settings`, {
        autoValidate: true,
      });
      expect(warned.status).toBe(409);
      expect(warned.body.details.warnings[0].code).toBe('FORMULA_CELL_TARGETED');
      expectStatus(
        await admin.send('patch', `/admin/forms/${tresorId}/settings`, {
          autoValidate: true,
          confirm: true,
        }),
        200,
      );
      const s = await submitted(kira, tresorId, { or: 9 });
      expect(s.status).toBe('validated');
      const row = await prisma.submission.findUniqueOrThrow({ where: { id: s.id } });
      expect(row.decidedBy).toBeNull();
      const entry = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'submission.validate' },
      });
      expect(entry).toMatchObject({ actorKind: 'system', actorId: null, targetId: s.id });

      expectStatus(
        await admin.send('patch', `/admin/forms/${stockId}/settings`, { autoValidate: true }),
        200,
      );
      const failed = await submitted(kira, stockId, { qte: -1 }, '150');
      expect(failed.status).toBe('pending');
      const queue = (await admin.get('/admin/submissions?status=pending'))
        .body as Paginated<SubmissionQueueItem>;
      expect(queue.items.map((i) => i.submission.id)).toEqual([failed.id]);
    });
  });

  describe('téléchargement et réimport', () => {
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
      return res.body as { reimportToken: string; lostValidations: object[] };
    }

    const confirmReimport = (reimportToken: string, mode: string) =>
      admin.send('post', `/admin/sources/${source.id}/reimport/confirm`, { reimportToken, mode });

    it('le téléchargement contient les valeurs validées', async () => {
      const { formIds } = await buildPage([{ mode: 'modification', def: () => tresor() }]);
      const s = await submitted(kira, formIds[0]!, { or: 150 });
      expectStatus(await validate(s.id), 200);
      const file = await download();
      const other = await admin.upload('/admin/sources/upload', file, 'copie.xlsx');
      expectStatus(other, 201);
      const g2 = await prisma.stagingCell.findUnique({
        where: {
          sourceId_sheet_row_col: {
            sourceId: other.body.id as string,
            sheet: SHEET,
            row: 2,
            col: 7,
          },
        },
      });
      expect(g2).toMatchObject({ valueText: '150' });
    });

    it("validations perdues listées ; écraser, réappliquer dans l'ordre ; jeton expiré ; choix tracé", async () => {
      const { formIds } = await buildPage(
        [
          { mode: 'modification', def: () => tresor() },
          { mode: 'ligne', def: stockLine() },
        ],
        [table()],
      );
      const [tresorId, stockId] = formIds as [string, string];
      const gold = await submitted(kira, tresorId, { or: 150 });
      const move = await submitted(kira, stockId, { qte: -2 }, '101');
      expectStatus(await validate(gold.id), 200);
      expectStatus(await validate(move.id, { confirm: true }), 200);

      // Fichier du poste de l'admin : ancienne version, avec une ligne en plus.
      const edited = await buildXlsx({
        [SHEET]: {
          A1: 'Référence',
          C1: 'Quantité',
          A2: 101,
          C2: 10,
          A3: 137,
          C3: 5,
          G2: 100,
          A6: 200,
          C6: 1,
        },
        [INSCRIPTIONS]: {},
        [REF]: {},
      });
      const preview = await reimportPreview(edited);
      expect(preview.lostValidations).toEqual([
        expect.objectContaining({
          submissionId: gold.id,
          cell: `${SHEET}!G2`,
          validatedValue: '150',
          valueInNewFile: '100',
        }),
        expect.objectContaining({
          submissionId: move.id,
          cell: `${SHEET}!C2`,
          validatedValue: '6',
          valueInNewFile: '10',
        }),
      ]);

      // Écraser : les validations sont perdues.
      expect((await confirmReimport(preview.reimportToken, 'overwrite')).status).toBe(204);
      expect(await staged(SHEET, 2, 7)).toMatchObject({ valueText: '100' });
      expect(await staged(SHEET, 6, 1)).toMatchObject({ valueText: '200' });
      expect((await confirmReimport(preview.reimportToken, 'overwrite')).body.code).toBe(
        'REIMPORT_TOKEN_EXPIRED',
      );
      // Elles ne sont plus dans la version de référence : rien à perdre de nouveau.
      expect((await reimportPreview(edited)).lostValidations).toEqual([]);

      // Nouvelle validation, puis réimport avec réapplication.
      const gold2 = await submitted(paul, tresorId, { or: 175 });
      expectStatus(await validate(gold2.id), 200);
      const second = await reimportPreview(edited);
      expect(second.lostValidations).toHaveLength(1);
      expect((await confirmReimport(second.reimportToken, 'reapply')).status).toBe(204);
      expect(await staged(SHEET, 2, 7)).toMatchObject({ valueText: '175' });
      const entries = await prisma.auditLog.findMany({
        where: { action: 'source.reimport' },
        orderBy: { createdAt: 'asc' },
      });
      expect(entries.map((e) => (e.after as { mode: string }).mode)).toEqual([
        'overwrite',
        'reapply',
      ]);
      expect((entries[1]!.after as { reapplied: string[] }).reapplied).toEqual([gold2.id]);

      // Jeton expiré.
      const late = await reimportPreview(edited);
      await prisma.reimportPreview.update({
        where: { id: late.reimportToken },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const expiredRes = await confirmReimport(late.reimportToken, 'overwrite');
      expect(expiredRes.status).toBe(409);
      expect(expiredRes.body.code).toBe('REIMPORT_TOKEN_EXPIRED');
    });

    it('réappliquer un mouvement sur le nouveau fichier ; téléchargement pris en compte', async () => {
      const { formIds } = await buildPage([{ mode: 'ligne', def: stockLine() }], [table()]);
      const move = await submitted(kira, formIds[0]!, { qte: -3 }, '137');
      expectStatus(await validate(move.id, { confirm: true }), 200);
      const downloaded = await download();
      // Téléchargé après la validation : rien ne serait perdu.
      expect((await reimportPreview(downloaded)).lostValidations).toEqual([]);

      const restocked = await buildXlsx({
        [SHEET]: { A1: 'Référence', A2: 101, C2: 8, A3: 137, C3: 20 },
      });
      const move2 = await submitted(kira, formIds[0]!, { qte: -1 }, '137');
      expectStatus(await validate(move2.id, { confirm: true }), 200);
      const preview = await reimportPreview(restocked);
      expect(preview.lostValidations).toHaveLength(1);
      expect((await confirmReimport(preview.reimportToken, 'reapply')).status).toBe(204);
      // Le mouvement s'applique à la nouvelle valeur : 20 − 1.
      expect(await staged(SHEET, 3, 3)).toMatchObject({ valueText: '19' });
    });
  });
});
