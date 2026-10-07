import type { NestExpressApplication } from '@nestjs/platform-express';
import type {
  AdminForm,
  AdminPage,
  AssembledPage,
  Block,
  FormDefinition,
  InstantiateResult,
  PageConfig,
  Row,
  SourceSummary,
  TemplateSummary,
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
import { buildXlsx } from './xlsx.js';

const rowOf = (block: Block): Row => ({ id: uid(), columns: [{ width: '1/1', block }] });

describe('Modèles et duplication (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: TestClient;
  let source: SourceSummary;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    admin = await adminClient(app);
    const xlsx = await buildXlsx({
      Arkan: { A1: 'Objet', B1: 'Quantité', A2: 'Épée', B2: 3, D1: 'Or', D2: 250 },
      Zelia: { A1: 'Objet', B1: 'Quantité', A2: 'Arc', B2: 1, D1: 'Or', D2: 40 },
    });
    const res = await admin.upload('/admin/sources/upload', xlsx, 'joueurs.xlsx');
    expectStatus(res, 201);
    source = res.body as SourceSummary;
  });

  afterAll(async () => {
    await app.close();
  });

  async function createPage(name: string): Promise<AdminPage> {
    const res = await admin.send('post', '/admin/pages', { name });
    expectStatus(res, 201);
    return res.body as AdminPage;
  }

  async function saveDraft(pageId: string, config: PageConfig): Promise<AdminPage> {
    const page = (await admin.get(`/admin/pages/${pageId}`)).body as AdminPage;
    const res = await admin.send('put', `/admin/pages/${pageId}/draft`, {
      name: page.name,
      config,
      version: page.version,
    });
    expectStatus(res, 200);
    return res.body as AdminPage;
  }

  async function publish(pageId: string) {
    expectStatus(
      await admin.send('post', `/admin/pages/${pageId}/publish`, { confirm: true }),
      200,
    );
  }

  /** Formulaire rattaché à un bloc, avec sa définition. */
  async function createForm(
    pageId: string,
    mode: 'modification' | 'ajout',
    definition: FormDefinition,
  ): Promise<{ formId: string; blockId: string }> {
    const blockId = uid();
    const created = await admin.send('post', '/admin/forms', {
      pageId,
      pageBlockId: blockId,
      mode,
    });
    expectStatus(created, 201);
    const form = created.body as AdminForm;
    expectStatus(
      await admin.send('put', `/admin/forms/${form.id}/draft`, {
        definition,
        version: form.version,
      }),
      200,
    );
    return { formId: form.id, blockId };
  }

  async function saveTemplate(type: string, sourceId: string, name: string) {
    const res = await admin.send('post', '/admin/templates', { type, sourceId, name });
    expectStatus(res, 201);
    return res.body as TemplateSummary;
  }

  async function instantiate(id: string, body: object = {}) {
    const res = await admin.send('post', `/admin/templates/${id}/instantiate`, body);
    expectStatus(res, 201);
    return res.body as InstantiateResult;
  }

  const or: FormDefinition = {
    title: 'Or',
    intro: '',
    successMessage: '',
    sourceId: '',
    sheet: 'Arkan',
    fields: [
      {
        key: 'or',
        label: 'Or',
        help: '',
        type: 'number',
        required: true,
        cell: 'D2',
        movement: true,
      },
    ],
  };

  describe('modèle de page (parcours D)', () => {
    it('copie en brouillon, sans permission : plages et valeurs insérées vidées, formulaires non configurés, espaces et chats vides', async () => {
      const kira = await userClient(app, admin, 'kira');
      const arkan = await createPage('Espace Arkan');
      await createGroup(admin, 'Arkan', { userIds: [await meId(kira)], pageIds: [arkan.id] });
      const { formId, blockId: formBlock } = await createForm(arkan.id, 'modification', {
        ...or,
        sourceId: source.id,
      });
      const table: Block = {
        id: uid(),
        type: 'table',
        config: {
          sourceId: source.id,
          sheet: 'Arkan',
          range: { mode: 'extensible', columns: 'A:B', startRow: 1 },
          headerRow: true,
          columns: [{ col: 'A', visible: true, label: '', format: 'text' }],
          pageSize: 25,
          sortable: true,
          searchable: true,
        },
      };
      const rich: Block = {
        id: uid(),
        type: 'rich_content',
        config: {
          html: `<p>Or : <span data-cell-source="${source.id}" data-cell-sheet="Arkan" data-cell-ref="D2" data-cell-format="number">x</span></p>`,
        },
      };
      const space: Block = {
        id: uid(),
        type: 'discussion_space',
        config: { name: 'Journal', sortMode: 'activity' },
      };
      const chat: Block = { id: uid(), type: 'chat', config: { name: 'Salon', height: 300 } };
      await saveDraft(arkan.id, {
        zones: {
          main: [
            rowOf(table),
            rowOf(rich),
            rowOf({ id: formBlock, type: 'form', config: { formId } }),
            rowOf(space),
          ],
          sidebar: [rowOf(chat)],
        },
        themeId: null,
        showHeader: true,
        showFooter: false,
        showSidebar: false,
      });
      await publish(arkan.id);
      const arkanSpace = await prisma.discussionSpace.findFirstOrThrow({
        where: { pageId: arkan.id },
      });
      expectStatus(
        await admin.send('post', `/spaces/${arkanSpace.id}/topics`, {
          title: 'Butin',
          firstMessage: '<p>Une épée</p>',
        }),
        201,
      );

      const template = await saveTemplate('page', arkan.id, 'Espace joueur');
      expect(template).toMatchObject({
        type: 'page',
        name: 'Espace joueur',
        details: { blocks: 5 },
      });
      const result = await instantiate(template.id, { name: 'Espace Zelia' });
      expect(result.type).toBe('page');
      const pageId = (result as { pageId: string }).pageId;

      const copy = (await admin.get(`/admin/pages/${pageId}`)).body as AdminPage;
      expect(copy).toMatchObject({ name: 'Espace Zelia', publishedAt: null, published: null });
      expect(copy.draft).toMatchObject({ showHeader: true, showFooter: false });
      const blocks = [...copy.draft.zones.main!, ...copy.draft.zones.sidebar!].map(
        (r) => r.columns[0]!.block!,
      );
      expect(blocks.map((b) => b.type)).toEqual([
        'table',
        'rich_content',
        'form',
        'discussion_space',
        'chat',
      ]);
      // Copie indépendante : nouveaux identifiants.
      const oldIds = [table.id, rich.id, formBlock, space.id, chat.id];
      expect(blocks.some((b) => oldIds.includes(b.id))).toBe(false);
      expect(blocks[0]!.config).toMatchObject({ sourceId: null, sheet: null, range: null });
      const html = (blocks[1]!.config as { html: string }).html;
      expect(html).toBe('<p>Or : {D2}</p>');
      const newForm = (blocks[2]!.config as { formId: string }).formId;
      expect(newForm).not.toBe(formId);
      const form = (await admin.get(`/admin/forms/${newForm}`)).body as AdminForm;
      expect(form.draft).toMatchObject({ sourceId: source.id, sheet: null });
      expect(form.draft.fields[0]).toEqual({
        key: 'or',
        label: 'Or',
        help: '',
        type: 'number',
        required: true,
        movement: true,
      });

      // Aucune permission : la copie n'est lisible que par l'admin.
      expect(await prisma.groupPermission.count({ where: { pageId } })).toBe(0);
      // Le brouillon reste enregistrable tel quel, puis se publie.
      await saveDraft(pageId, copy.draft);
      await publish(pageId);
      expect((await kira.get(`/pages/${pageId}`)).status).toBe(404);

      // Tableau et formulaire non configurés : masqués ; espace et chat vides.
      const seen = (await admin.get(`/pages/${pageId}`)).body as AssembledPage;
      const types = [...seen.zones.main!, ...seen.zones.sidebar!].map(
        (r) => r.columns[0]!.block?.type ?? null,
      );
      expect(types).toEqual([null, 'rich_content', null, 'discussion_space', 'chat']);
      const newSpace = await prisma.discussionSpace.findFirstOrThrow({ where: { pageId } });
      expect(newSpace.id).not.toBe(arkanSpace.id);
      expect(await prisma.topic.count({ where: { spaceId: newSpace.id } })).toBe(0);
      const newChat = await prisma.chat.findFirstOrThrow({ where: { pageId } });
      expect(await prisma.chatMessage.count({ where: { chatId: newChat.id } })).toBe(0);
      const tableBlock = blocks[0]!.id;
      expect((await admin.get(`/blocks/${tableBlock}/rows`)).status).toBe(404);

      // L'original n'a pas bougé.
      const original = (await admin.get(`/admin/pages/${arkan.id}`)).body as AdminPage;
      expect(original.draft.zones.main![0]!.columns[0]!.block!.config).toMatchObject({
        sheet: 'Arkan',
      });

      const actions = await prisma.auditLog.findMany({
        where: { targetType: 'template', targetId: template.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(actions.map((a) => a.action)).toEqual(['template.create', 'template.instantiate']);
      expect(actions[1]!.after).toMatchObject({ type: 'page', pageId });
    });
  });

  describe('modèle de formulaire', () => {
    it('ajout : champs gardés ; colonnes, feuille, ligne de départ et nombre max réinitialisés', async () => {
      const page = await createPage('Inscriptions');
      const { formId } = await createForm(page.id, 'ajout', {
        title: 'Inscription',
        intro: 'Tournoi',
        successMessage: 'Merci',
        sourceId: source.id,
        sheet: 'Arkan',
        startRow: 3,
        maxNewRows: 5,
        fields: [
          {
            key: 'pseudo',
            label: 'Pseudo',
            help: '',
            type: 'text',
            required: false,
            col: 'A',
            auto: 'pseudo',
          },
          {
            key: 'classe',
            label: 'Classe',
            help: 'Votre classe',
            type: 'select',
            required: true,
            col: 'B',
            options: { kind: 'range', sourceId: source.id, sheet: 'Arkan', range: 'A1:A2' },
          },
        ],
      });
      const template = await saveTemplate('form', formId, 'Inscription');
      expect(template.details).toEqual({ mode: 'ajout', fields: 2 });

      const other = await createPage('Autre tournoi');
      const blockId = uid();
      const result = await instantiate(template.id, { pageId: other.id, pageBlockId: blockId });
      const form = (await admin.get(`/admin/forms/${(result as { formId: string }).formId}`))
        .body as AdminForm;
      expect(form).toMatchObject({ mode: 'ajout', pageId: other.id, blockId });
      expect(form.draft).toEqual({
        title: 'Inscription',
        intro: 'Tournoi',
        successMessage: 'Merci',
        sourceId: source.id,
        sheet: null,
        fields: [
          {
            key: 'pseudo',
            label: 'Pseudo',
            help: '',
            type: 'text',
            required: false,
            auto: 'pseudo',
          },
          {
            key: 'classe',
            label: 'Classe',
            help: 'Votre classe',
            type: 'select',
            required: true,
            options: { kind: 'list', values: [] },
          },
        ],
      });
      expect(form.configured).toBe(false);

      const missing = await admin.send('post', `/admin/templates/${template.id}/instantiate`, {});
      expect(missing.status).toBe(400);
      expect(Object.keys(missing.body.details.fields).sort()).toEqual(['pageBlockId', 'pageId']);
      const taken = await admin.send('post', `/admin/templates/${template.id}/instantiate`, {
        pageId: other.id,
        pageBlockId: blockId,
      });
      expect(taken.status).toBe(400);
    });
  });

  describe('modèle de sujet', () => {
    it('titre et message d’ouverture seulement, dans l’espace choisi', async () => {
      const page = await createPage('Taverne');
      await saveDraft(page.id, {
        zones: {
          main: [
            rowOf({
              id: uid(),
              type: 'discussion_space',
              config: { name: 'A', sortMode: 'activity' },
            }),
            rowOf({
              id: uid(),
              type: 'discussion_space',
              config: { name: 'B', sortMode: 'activity' },
            }),
          ],
          sidebar: null,
        },
        themeId: null,
        showHeader: true,
        showFooter: true,
        showSidebar: false,
      });
      await publish(page.id);
      const [a, b] = await prisma.discussionSpace.findMany({
        where: { pageId: page.id },
        orderBy: { name: 'asc' },
      });
      const opened = await admin.send('post', `/spaces/${a!.id}/topics`, {
        title: 'Recrutement',
        firstMessage: '<p>Présentez-vous ici.</p>',
      });
      expectStatus(opened, 201);
      const topicId = opened.body.id as string;
      expectStatus(
        await admin.send('post', `/topics/${topicId}/messages`, { content: '<p>Réponse</p>' }),
        201,
      );

      const template = await saveTemplate('topic', topicId, 'Recrutement');
      expect(template.details).toEqual({ title: 'Recrutement' });
      const result = await instantiate(template.id, { spaceId: b!.id });
      expect(result).toMatchObject({ type: 'topic', spaceId: b!.id });
      const topic = await prisma.topic.findUniqueOrThrow({
        where: { id: (result as { topicId: string }).topicId },
        include: { messages: true },
      });
      expect(topic.title).toBe('Recrutement');
      expect(topic.messages.map((m) => m.content)).toEqual(['<p>Présentez-vous ici.</p>']);

      expect(
        (await admin.send('post', `/admin/templates/${template.id}/instantiate`, {})).status,
      ).toBe(400);
      expect(
        (
          await admin.send('post', `/admin/templates/${template.id}/instantiate`, {
            spaceId: uid(),
          })
        ).status,
      ).toBe(404);
    });
  });

  describe('bibliothèque', () => {
    it('nom unique par type, filtre, suppression tracée, source introuvable, réservé à l’admin', async () => {
      const page = await createPage('Accueil');
      const template = await saveTemplate('page', page.id, 'Base');
      const taken = await admin.send('post', '/admin/templates', {
        type: 'page',
        sourceId: page.id,
        name: 'Base',
      });
      expect(taken.status).toBe(409);
      expect(taken.body.code).toBe('TEMPLATE_NAME_TAKEN');
      const unknown = await admin.send('post', '/admin/templates', {
        type: 'form',
        sourceId: page.id,
        name: 'Base',
      });
      expect(unknown.status).toBe(400);
      expect(unknown.body.details.fields).toEqual({ sourceId: ['notFound'] });

      expect((await admin.get('/admin/templates?type=page')).body).toHaveLength(1);
      expect((await admin.get('/admin/templates?type=form')).body).toEqual([]);

      const kira = await userClient(app, admin, 'kira');
      expect((await kira.get('/admin/templates')).status).toBe(404);
      expect(
        (await kira.send('post', `/admin/templates/${template.id}/instantiate`, {})).status,
      ).toBe(404);

      expectStatus(await admin.send('delete', `/admin/templates/${template.id}`), 204);
      expect((await admin.get('/admin/templates')).body).toEqual([]);
      expect(
        await prisma.auditLog.count({
          where: { action: 'template.delete', targetId: template.id },
        }),
      ).toBe(1);
    });
  });
});
