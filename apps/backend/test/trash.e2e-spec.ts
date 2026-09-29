import type { NestExpressApplication } from '@nestjs/platform-express';
import type { AdminPage, Paginated, PageConfig, Row, TrashItem } from '@strategos/shared';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  adminClient,
  createGroup,
  createTestApp,
  createUser,
  expectStatus,
  meId,
  resetDatabase,
  TestClient,
  uid,
  userClient,
} from './helpers.js';

const config = (main: Row[]): PageConfig => ({
  zones: { main, sidebar: null },
  themeId: null,
  showHeader: true,
  showFooter: true,
});

describe('Corbeille (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: TestClient;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    admin = await adminClient(app);
  });

  afterAll(async () => {
    await app.close();
  });

  async function trash(query = ''): Promise<Paginated<TrashItem>> {
    const res = await admin.get(`/admin/trash${query}`);
    expectStatus(res, 200);
    return res.body as Paginated<TrashItem>;
  }

  const restore = (type: string, id: string) =>
    admin.send('post', `/admin/trash/${type}/${id}/restore`);

  async function createPage(name: string, main: Row[] = []): Promise<AdminPage> {
    const created = await admin.send('post', '/admin/pages', { name });
    expectStatus(created, 201);
    const page = created.body as AdminPage;
    if (main.length) {
      expectStatus(
        await admin.send('put', `/admin/pages/${page.id}/draft`, {
          name,
          config: config(main),
          version: page.version,
        }),
        200,
      );
    }
    return (await admin.get(`/admin/pages/${page.id}`)).body as AdminPage;
  }

  /** Page avec un formulaire jamais publié, supprimé : il part directement à la corbeille. */
  async function deletedForm() {
    const page = await createPage('Tournoi');
    const blockId = uid();
    const form = await admin.send('post', '/admin/forms', {
      pageId: page.id,
      pageBlockId: blockId,
      mode: 'ajout',
    });
    expectStatus(form, 201);
    const formId = form.body.id as string;
    const row: Row = {
      id: uid(),
      columns: [{ width: '1/1', block: { id: blockId, type: 'form', config: { formId } } }],
    };
    expectStatus(
      await admin.send('put', `/admin/pages/${page.id}/draft`, {
        name: page.name,
        config: config([row]),
        version: page.version,
      }),
      200,
    );
    expectStatus(await admin.send('delete', `/admin/forms/${formId}`), 204);
    return { pageId: page.id, formId, blockId };
  }

  /** Espace publié, sujet ouvert par l'admin, avec un second message. */
  async function topicWithMessage() {
    const blockId = uid();
    const page = await createPage('Taverne', [
      {
        id: uid(),
        columns: [
          {
            width: '1/1',
            block: {
              id: blockId,
              type: 'discussion_space',
              config: { name: 'Taverne', sortMode: 'activity' },
            },
          },
        ],
      },
    ]);
    expectStatus(await admin.send('post', `/admin/pages/${page.id}/publish`), 200);
    const space = await prisma.discussionSpace.findFirstOrThrow({ where: { blockId } });
    const topic = await admin.send('post', `/spaces/${space.id}/topics`, {
      title: 'Stratégie',
      firstMessage: '<p>Premier</p>',
    });
    expectStatus(topic, 201);
    const topicId = topic.body.id as string;
    const message = await admin.send('post', `/topics/${topicId}/messages`, {
      content: '<p>Tank <strong>devant</strong> &amp; soigneur derrière</p>',
    });
    expectStatus(message, 201);
    return { pageId: page.id, topicId, messageId: message.body.id as string };
  }

  it('liste chaque type supprimé, filtre par type, pagine ; les notes n’y sont pas', async () => {
    const page = await createPage('Accueil');
    expectStatus(await admin.send('delete', `/admin/pages/${page.id}`), 204);
    const { formId } = await deletedForm();
    const { topicId, messageId } = await topicWithMessage();
    expectStatus(await admin.send('delete', `/messages/${messageId}`), 204);
    expectStatus(await admin.send('delete', `/admin/topics/${topicId}`), 204);
    const groupId = await createGroup(admin, 'Officiers');
    expectStatus(await admin.send('delete', `/admin/groups/${groupId}`), 204);
    const userId = await createUser(admin, 'arkan');
    expectStatus(await admin.send('delete', `/admin/users/${userId}`), 204);
    // Message de chat supprimé par son auteur.
    const chat = await prisma.chat.create({
      data: { pageId: page.id, blockId: uid(), name: 'Salon' },
    });
    const chatMessage = await prisma.chatMessage.create({
      data: {
        chatId: chat.id,
        authorId: await meId(admin),
        content: '<p>Bonjour</p>',
        deletedAt: new Date(),
      },
    });
    // Une note supprimée n'apparaît jamais.
    const kira = await userClient(app, admin, 'kira');
    const note = await kira.send('post', '/me/notes', { title: 'Secret', content: '<p>x</p>' });
    expectStatus(await kira.send('delete', `/me/notes/${note.body.id}`), 204);

    const all = await trash();
    expect(all.total).toBe(7);
    expect(new Set(all.items.map((i) => i.type))).toEqual(
      new Set(['page', 'form', 'topic', 'topic_message', 'chat_message', 'group', 'user']),
    );
    expect(all.items.find((i) => i.type === 'topic_message')).toMatchObject({
      id: messageId,
      label: 'Tank devant & soigneur derrière',
      context: 'Stratégie',
      author: 'admin',
    });
    expect(all.items.find((i) => i.type === 'form')).toMatchObject({
      id: formId,
      context: 'Tournoi',
    });
    expect(all.items.find((i) => i.type === 'chat_message')).toMatchObject({
      id: chatMessage.id,
      label: 'Bonjour',
      context: 'Salon',
    });
    expect(all.items.some((i) => i.label === 'Secret')).toBe(false);
    // Du plus récent au plus ancien.
    const dates = all.items.map((i) => i.deletedAt);
    expect([...dates].sort().reverse()).toEqual(dates);

    const users = await trash('?type=user');
    expect(users).toMatchObject({
      total: 1,
      items: [{ type: 'user', id: userId, label: 'arkan' }],
    });
    const paged = await trash('?pageSize=3&page=3');
    expect(paged).toMatchObject({ total: 7, page: 3, pageSize: 3 });
    expect(paged.items).toHaveLength(1);
    expectStatus(await admin.get('/admin/trash?type=note'), 400);
  });

  it('restaure une page, un groupe, un compte, un sujet et un message, et le trace', async () => {
    const page = await createPage('Accueil');
    expectStatus(await admin.send('delete', `/admin/pages/${page.id}`), 204);
    expectStatus(await restore('page', page.id), 204);
    expectStatus(await admin.get(`/admin/pages/${page.id}`), 200);

    const groupId = await createGroup(admin, 'Officiers');
    expectStatus(await admin.send('delete', `/admin/groups/${groupId}`), 204);
    expectStatus(await restore('group', groupId), 204);
    expectStatus(await admin.get(`/admin/groups/${groupId}`), 200);

    const kira = await userClient(app, admin, 'kira');
    const kiraId = await meId(kira);
    expectStatus(await admin.send('delete', `/admin/users/${kiraId}`), 204);
    expectStatus(await restore('user', kiraId), 204);
    expectStatus(await new TestClient(app).login('kira', 'mot-de-passe-utilisateur'), 200);

    const { topicId, messageId } = await topicWithMessage();
    expectStatus(await admin.send('delete', `/messages/${messageId}`), 204);
    expectStatus(await admin.send('delete', `/admin/topics/${topicId}`), 204);
    expectStatus(await admin.get(`/topics/${topicId}`), 404);
    // Le message attend que son sujet soit restauré.
    const blocked = await restore('topic_message', messageId);
    expectStatus(blocked, 422);
    expect(blocked.body.code).toBe('RESTORE_PARENT_DELETED');
    expectStatus(await restore('topic', topicId), 204);
    expectStatus(await restore('topic_message', messageId), 204);
    const topic = await admin.get(`/topics/${topicId}`);
    expectStatus(topic, 200);
    expect(topic.body.messages.items.map((m: { id: string }) => m.id)).toContain(messageId);

    expect((await trash()).total).toBe(0);
    const entries = await prisma.auditLog.findMany({
      where: { action: 'trash.restore' },
      orderBy: { createdAt: 'asc' },
    });
    expect(entries.map((e) => [e.targetType, e.targetId])).toEqual([
      ['page', page.id],
      ['group', groupId],
      ['user', kiraId],
      ['topic', topicId],
      ['message', messageId],
    ]);
    expect(entries[0]).toMatchObject({
      actorId: await meId(admin),
      before: { type: 'page', label: 'Accueil', deleted: true },
      after: { type: 'page', label: 'Accueil', deleted: false },
    });
  });

  it('suppression d’un sujet : tracée, sujet illisible pour ses lecteurs', async () => {
    const { topicId } = await topicWithMessage();
    expectStatus(await admin.send('delete', `/admin/topics/${topicId}`), 204);
    expectStatus(await admin.send('delete', `/admin/topics/${topicId}`), 404);
    const entry = await prisma.auditLog.findFirstOrThrow({ where: { action: 'topic.delete' } });
    expect(entry).toMatchObject({
      targetType: 'topic',
      targetId: topicId,
      after: { title: 'Stratégie', deleted: true },
    });
  });

  it('formulaire : son bloc revient dans le brouillon de la page', async () => {
    const { pageId, formId, blockId } = await deletedForm();
    const before = (await admin.get(`/admin/pages/${pageId}`)).body as AdminPage;
    expectStatus(await restore('form', formId), 204);
    const after = (await admin.get(`/admin/pages/${pageId}`)).body as AdminPage;
    expect(after.version).toBe(before.version + 1);
    const rows = after.draft.zones.main!;
    expect(rows.at(-1)!.columns).toEqual([
      { width: '1/1', block: { id: blockId, type: 'form', config: { formId } } },
    ]);
    expectStatus(await admin.get(`/admin/forms/${formId}`), 200);
  });

  it('formulaire dont la page est supprimée : 422 RESTORE_PARENT_DELETED', async () => {
    const { pageId, formId } = await deletedForm();
    expectStatus(await admin.send('delete', `/admin/pages/${pageId}`), 204);
    const res = await restore('form', formId);
    expectStatus(res, 422);
    expect(res.body.code).toBe('RESTORE_PARENT_DELETED');
    expect((await trash('?type=form')).total).toBe(1);
  });

  it('nom repris entre-temps : 409 USERNAME_TAKEN ou GROUP_NAME_TAKEN', async () => {
    const userId = await createUser(admin, 'arkan');
    expectStatus(await admin.send('delete', `/admin/users/${userId}`), 204);
    await createUser(admin, 'Arkan');
    const user = await restore('user', userId);
    expectStatus(user, 409);
    expect(user.body.code).toBe('USERNAME_TAKEN');

    const groupId = await createGroup(admin, 'Officiers');
    expectStatus(await admin.send('delete', `/admin/groups/${groupId}`), 204);
    await createGroup(admin, 'officiers');
    const group = await restore('group', groupId);
    expectStatus(group, 409);
    expect(group.body.code).toBe('GROUP_NAME_TAKEN');
    expect((await trash()).total).toBe(2);
  });

  it('404 : type inconnu, élément absent ou non supprimé ; réservé à l’admin', async () => {
    const page = await createPage('Accueil');
    expectStatus(await restore('page', page.id), 404);
    expectStatus(await restore('page', uid()), 404);
    expectStatus(await restore('note', uid()), 404);
    expect(await prisma.auditLog.count({ where: { action: 'trash.restore' } })).toBe(0);

    const kira = await userClient(app, admin, 'kira');
    expectStatus(await kira.get('/admin/trash'), 404);
    expectStatus(await kira.send('post', `/admin/trash/page/${page.id}/restore`), 404);
  });
});
