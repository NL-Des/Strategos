import type { NestExpressApplication } from '@nestjs/platform-express';
import type {
  AdminPage,
  AssembledPage,
  PageConfig,
  Row,
  TopicWithMessages,
} from '@strategos/shared';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  adminClient,
  createGroup,
  createTestApp,
  expectStatus,
  meId,
  PNG,
  resetDatabase,
  TestClient,
  uid,
  userClient,
} from './helpers.js';

const spaceRow = (name = 'Taverne'): Row => ({
  id: uid(),
  columns: [
    {
      width: '1/1',
      block: { id: uid(), type: 'discussion_space', config: { name, sortMode: 'activity' } },
    },
  ],
});

const config = (main: Row[]): PageConfig => ({
  zones: { main, sidebar: null },
  themeId: null,
  showHeader: true,
  showFooter: true,
});

/** Donne à un groupe des droits sur un espace (en gardant ses autres permissions). */
async function grantSpace(
  admin: TestClient,
  groupId: string,
  spaceId: string,
  rights: { read?: boolean; createTopic?: boolean; post?: boolean },
) {
  const { permissions } = (await admin.get(`/admin/groups/${groupId}`)).body as {
    permissions: {
      resourceType: string;
      resourceId: string;
      canRead: boolean;
      canCreateTopic: boolean;
      canPost: boolean;
    }[];
  };
  const body = [
    ...permissions
      .filter((p) => p.resourceId !== spaceId)
      .map(({ resourceType, resourceId, canRead, canCreateTopic, canPost }) => ({
        resourceType,
        resourceId,
        canRead,
        canCreateTopic,
        canPost,
      })),
    {
      resourceType: 'space',
      resourceId: spaceId,
      canRead: rights.read ?? false,
      canCreateTopic: rights.createTopic ?? false,
      canPost: rights.post ?? false,
    },
  ];
  expectStatus(
    await admin.send('put', `/admin/groups/${groupId}/permissions`, { permissions: body }),
    200,
  );
}

describe('Espaces de discussion (e2e)', () => {
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

  /** Crée une page avec un espace, la publie, et renvoie page, blockId et spaceId. */
  async function pageWithSpace(): Promise<{ page: AdminPage; blockId: string; spaceId: string }> {
    const created = await admin.send('post', '/admin/pages', { name: 'Taverne' });
    expectStatus(created, 201);
    const page = created.body as AdminPage;
    const row = spaceRow();
    const blockId = row.columns[0]!.block!.id;
    expectStatus(
      await admin.send('put', `/admin/pages/${page.id}/draft`, {
        name: page.name,
        config: config([row]),
        version: page.version,
      }),
      200,
    );
    expectStatus(await admin.send('post', `/admin/pages/${page.id}/publish`), 200);
    const space = await prisma.discussionSpace.findFirstOrThrow({ where: { blockId } });
    return {
      page: (await admin.get(`/admin/pages/${page.id}`)).body as AdminPage,
      blockId,
      spaceId: space.id,
    };
  }

  it('crée l’espace à la publication de la page, pas avant', async () => {
    const created = await admin.send('post', '/admin/pages', { name: 'Taverne' });
    const page = created.body as AdminPage;
    const row = spaceRow();
    await admin.send('put', `/admin/pages/${page.id}/draft`, {
      name: page.name,
      config: config([row]),
      version: page.version,
    });
    // Avant publication : aucun espace en base ; l'aperçu l'annonce.
    expect(await prisma.discussionSpace.count()).toBe(0);
    const preview = (await admin.get(`/admin/pages/${page.id}/publish/preview`)).body;
    expect(preview.spaces).toEqual([{ name: 'Taverne', change: 'created' }]);

    expectStatus(await admin.send('post', `/admin/pages/${page.id}/publish`), 200);
    expect(await prisma.discussionSpace.count({ where: { deletedAt: null } })).toBe(1);
  });

  it('retire le bloc → espace en suppression douce', async () => {
    const { page, spaceId } = await pageWithSpace();
    expectStatus(
      await admin.send('put', `/admin/pages/${page.id}/draft`, {
        name: page.name,
        config: config([]),
        version: page.version,
      }),
      200,
    );
    expectStatus(await admin.send('post', `/admin/pages/${page.id}/publish`), 200);
    const space = await prisma.discussionSpace.findUniqueOrThrow({ where: { id: spaceId } });
    expect(space.deletedAt).not.toBeNull();
  });

  it('espace illisible : module absent de la page et 404 sur ses routes', async () => {
    const { page, spaceId } = await pageWithSpace();
    const bob = await userClient(app, admin, 'bob');
    // Bob lit la page mais pas l'espace.
    await createGroup(admin, 'Lecteurs page', { userIds: [await meId(bob)], pageIds: [page.id] });

    const assembled = (await bob.get(`/pages/${page.id}`)).body as AssembledPage;
    expect(assembled.zones.main![0]!.columns[0]!.block).toBeNull();
    expectStatus(await bob.get(`/spaces/${spaceId}/topics`), 404);
  });

  describe('sujets et messages', () => {
    let page: AdminPage;
    let spaceId: string;
    let kira: TestClient;
    let membres: string;

    beforeEach(async () => {
      ({ page, spaceId } = await pageWithSpace());
      kira = await userClient(app, admin, 'kira');
      membres = await createGroup(admin, 'Membres', {
        userIds: [await meId(kira)],
        pageIds: [page.id],
      });
      await grantSpace(admin, membres, spaceId, { read: true, createTopic: true, post: true });
    });

    it('lecture seule (sans post) : lire OK, ouvrir un sujet → 403', async () => {
      const invite = await userClient(app, admin, 'invite');
      const invites = await createGroup(admin, 'Invités', {
        userIds: [await meId(invite)],
        pageIds: [page.id],
      });
      await grantSpace(admin, invites, spaceId, { read: true });

      // Kira ouvre un sujet.
      const opened = await kira.send('post', `/spaces/${spaceId}/topics`, {
        title: 'Recrutement',
        firstMessage: '<p>Bonjour</p>',
      });
      expectStatus(opened, 201);

      // L'invité lit la liste mais ne peut ni ouvrir ni poster.
      expectStatus(await invite.get(`/spaces/${spaceId}/topics`), 200);
      expectStatus(
        await invite.send('post', `/spaces/${spaceId}/topics`, {
          title: 'X',
          firstMessage: '<p>y</p>',
        }),
        403,
      );
      const topicId = opened.body.id as string;
      expectStatus(
        await invite.send('post', `/topics/${topicId}/messages`, { content: '<p>non</p>' }),
        403,
      );
    });

    it('sujet clos → 422 TOPIC_CLOSED', async () => {
      const opened = await kira.send('post', `/spaces/${spaceId}/topics`, {
        title: 'T',
        firstMessage: '<p>a</p>',
      });
      const topicId = opened.body.id as string;
      expectStatus(await kira.send('patch', `/topics/${topicId}`, { closed: true }), 200);
      const res = await kira.send('post', `/topics/${topicId}/messages`, { content: '<p>b</p>' });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('TOPIC_CLOSED');
    });

    it('renommer/clore réservé à l’auteur ou l’admin ; épingler à l’admin', async () => {
      const bob = await userClient(app, admin, 'bob');
      await grantSpace(admin, membres, spaceId, { read: true, createTopic: true, post: true });
      // bob membre du groupe pour lire/poster.
      expectStatus(
        await admin.send('put', `/admin/groups/${membres}/members`, {
          userIds: [await meId(kira), await meId(bob)],
        }),
        200,
      );
      const opened = await kira.send('post', `/spaces/${spaceId}/topics`, {
        title: 'T',
        firstMessage: '<p>a</p>',
      });
      const topicId = opened.body.id as string;

      // bob (pas l'auteur) ne peut pas renommer.
      const forbidden = await bob.send('patch', `/topics/${topicId}`, { title: 'Zzz' });
      expect(forbidden.status).toBe(403);
      expect(forbidden.body.code).toBe('NOT_AUTHOR');
      // l'admin peut.
      expectStatus(await admin.send('patch', `/topics/${topicId}`, { title: 'Renommé' }), 200);

      // épingler : route admin seulement (l'espace admin n'existe pas pour un non-admin → 404).
      expectStatus(await kira.send('patch', `/admin/topics/${topicId}`, { pinned: true }), 404);
      expectStatus(await admin.send('patch', `/admin/topics/${topicId}`, { pinned: true }), 200);
    });

    it('modifier/supprimer le message d’un autre → 403 NOT_AUTHOR ; archivage avant', async () => {
      const opened = await kira.send('post', `/spaces/${spaceId}/topics`, {
        title: 'T',
        firstMessage: '<p>a</p>',
      });
      const topicId = opened.body.id as string;
      const posted = await kira.send('post', `/topics/${topicId}/messages`, {
        content: '<p>x</p>',
      });
      const messageId = posted.body.id as string;

      const bob = await userClient(app, admin, 'bob');
      const bobId = await meId(bob);
      expectStatus(
        await admin.send('put', `/admin/groups/${membres}/members`, {
          userIds: [await meId(kira), bobId],
        }),
        200,
      );
      const forbidden = await bob.send('put', `/messages/${messageId}`, { content: '<p>hack</p>' });
      expect(forbidden.status).toBe(403);
      expect(forbidden.body.code).toBe('NOT_AUTHOR');

      // L'auteur modifie : l'ancienne version est archivée avant.
      expectStatus(
        await kira.send('put', `/messages/${messageId}`, { content: '<p>corrigé</p>' }),
        200,
      );
      const revisions = await prisma.messageRevision.findMany({
        where: { topicMessageId: messageId },
      });
      expect(revisions).toHaveLength(1);
      expect(revisions[0]!.action).toBe('edit');
      expect(revisions[0]!.previousContent).toBe('<p>x</p>');
    });

    it('l’admin modifie ou supprime le message d’un autre : tracé au journal', async () => {
      const opened = await kira.send('post', `/spaces/${spaceId}/topics`, {
        title: 'T',
        firstMessage: '<p>a</p>',
      });
      const topicId = opened.body.id as string;
      const posted = await kira.send('post', `/topics/${topicId}/messages`, {
        content: '<p>x</p>',
      });
      const messageId = posted.body.id as string;

      // L'auteur modifie le sien : rien au journal.
      expectStatus(await kira.send('put', `/messages/${messageId}`, { content: '<p>y</p>' }), 200);
      expect(await prisma.auditLog.count({ where: { targetId: messageId } })).toBe(0);

      expectStatus(await admin.send('put', `/messages/${messageId}`, { content: '<p>z</p>' }), 200);
      expectStatus(await admin.send('delete', `/messages/${messageId}`), 204);
      const actions = await prisma.auditLog.findMany({
        where: { targetId: messageId },
        orderBy: { createdAt: 'asc' },
      });
      expect(actions.map((a) => a.action)).toEqual(['message.admin_edit', 'message.admin_delete']);
      expect(actions[0]!.after).toMatchObject({ topicId, spaceId });
    });

    it('masquage : message exclu des lecteurs, archivé et tracé au journal', async () => {
      const opened = await kira.send('post', `/spaces/${spaceId}/topics`, {
        title: 'T',
        firstMessage: '<p>ouverture</p>',
      });
      const topicId = opened.body.id as string;
      const posted = await kira.send('post', `/topics/${topicId}/messages`, {
        content: '<p>à masquer</p>',
      });
      const messageId = posted.body.id as string;

      expectStatus(await admin.send('post', `/admin/messages/${messageId}/hide`), 204);

      const view = (await kira.get(`/topics/${topicId}`)).body as TopicWithMessages;
      const ids = view.messages.items.map((m) => m.id);
      expect(ids).not.toContain(messageId);

      const revision = await prisma.messageRevision.findFirstOrThrow({
        where: { topicMessageId: messageId, action: 'hide' },
      });
      expect(revision.previousContent).toBe('<p>à masquer</p>');

      const audit = await prisma.auditLog.findFirst({ where: { action: 'message.hide' } });
      expect(audit?.targetId).toBe(messageId);
    });

    it('supprimer son message : exclu des lecteurs et archivé', async () => {
      const opened = await kira.send('post', `/spaces/${spaceId}/topics`, {
        title: 'T',
        firstMessage: '<p>ouverture</p>',
      });
      const topicId = opened.body.id as string;
      const posted = await kira.send('post', `/topics/${topicId}/messages`, {
        content: '<p>bye</p>',
      });
      const messageId = posted.body.id as string;

      expectStatus(await kira.send('delete', `/messages/${messageId}`), 204);
      const view = (await kira.get(`/topics/${topicId}`)).body as TopicWithMessages;
      expect(view.messages.items.map((m) => m.id)).not.toContain(messageId);
      const revision = await prisma.messageRevision.findFirstOrThrow({
        where: { topicMessageId: messageId, action: 'delete' },
      });
      expect(revision.previousContent).toBe('<p>bye</p>');
    });
  });

  describe('pièces jointes', () => {
    let page: AdminPage;
    let spaceId: string;
    let kira: TestClient;

    beforeEach(async () => {
      ({ page, spaceId } = await pageWithSpace());
      kira = await userClient(app, admin, 'kira');
      const membres = await createGroup(admin, 'Membres', {
        userIds: [await meId(kira)],
        pageIds: [page.id],
      });
      await grantSpace(admin, membres, spaceId, { read: true, createTopic: true, post: true });
    });

    it('image acceptée, rattachée et lisible par un lecteur de l’espace ; refusée aux autres', async () => {
      const up = await kira.upload('/attachments', PNG, 'photo.png');
      expectStatus(up, 201);
      const attachmentId = up.body.id as string;

      const opened = await kira.send('post', `/spaces/${spaceId}/topics`, {
        title: 'T',
        firstMessage: '<p>photo</p>',
        attachmentIds: [attachmentId],
      });
      expectStatus(opened, 201);

      // Lisible par Kira (lectrice de l'espace).
      expectStatus(await kira.get(`/attachments/${attachmentId}`), 200);

      // Un utilisateur sans accès à l'espace → 404.
      const bob = await userClient(app, admin, 'bob');
      expectStatus(await bob.get(`/attachments/${attachmentId}`), 404);
    });

    it('type non image → 415', async () => {
      const res = await kira.upload('/attachments', Buffer.from('pas une image'), 'x.png');
      expect(res.status).toBe(415);
      expect(res.body.code).toBe('UNSUPPORTED_FILE_TYPE');
    });

    it('fichier trop gros → 413', async () => {
      const big = Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024)]);
      const res = await kira.upload('/attachments', big, 'big.png');
      expect(res.status).toBe(413);
      expect(res.body.code).toBe('FILE_TOO_LARGE');
    });

    it('plus de 4 pièces jointes → 422 TOO_MANY_ATTACHMENTS', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 5; i += 1) {
        const up = await kira.upload('/attachments', PNG, `p${i}.png`);
        ids.push(up.body.id as string);
      }
      const res = await kira.send('post', `/spaces/${spaceId}/topics`, {
        title: 'T',
        firstMessage: '<p>trop</p>',
        attachmentIds: ids,
      });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('TOO_MANY_ATTACHMENTS');
    });
  });
});
