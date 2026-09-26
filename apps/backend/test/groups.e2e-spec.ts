import type { NestExpressApplication } from '@nestjs/platform-express';
import type { GroupDetail, UserDetail } from '@strategos/shared';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  TestClient,
  adminClient,
  createGroup,
  createTestApp,
  createUser,
  expectStatus,
  resetDatabase,
} from './helpers.js';

describe('Groupes et permissions (e2e)', () => {
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

  async function createPage(name: string): Promise<string> {
    const res = await admin.send('post', '/admin/pages', { name });
    expectStatus(res, 201);
    return res.body.id as string;
  }

  const pagePermission = (resourceId: string, rights: object = {}) => ({
    resourceType: 'page',
    resourceId,
    canRead: true,
    canCreateTopic: false,
    canPost: false,
    ...rights,
  });

  describe('gestion des groupes', () => {
    it('création, renommage, description, liste et suppression douce', async () => {
      const created = await admin.send('post', '/admin/groups', {
        name: 'Membres',
        description: 'Joueurs de la guilde',
      });
      expectStatus(created, 201);
      const group = created.body as GroupDetail;
      expect(group).toMatchObject({ name: 'Membres', memberCount: 0, members: [], version: 1 });

      const renamed = await admin.send('patch', `/admin/groups/${group.id}`, {
        name: 'Officiers',
        description: '',
        version: 1,
      });
      expectStatus(renamed, 200);
      expect(renamed.body).toMatchObject({ name: 'Officiers', description: null, version: 2 });

      expect((await admin.get('/admin/groups')).body.map((g: GroupDetail) => g.name)).toEqual([
        'Officiers',
      ]);
      expectStatus(await admin.send('delete', `/admin/groups/${group.id}`), 204);
      expect((await admin.get('/admin/groups')).body).toEqual([]);
      expect((await admin.get(`/admin/groups/${group.id}`)).status).toBe(404);
    });

    it('nom déjà pris (sans tenir compte de la casse) → 409 GROUP_NAME_TAKEN ; libre après suppression', async () => {
      const id = await createGroup(admin, 'Membres');
      const taken = await admin.send('post', '/admin/groups', { name: 'membres' });
      expect(taken.status).toBe(409);
      expect(taken.body.code).toBe('GROUP_NAME_TAKEN');

      await admin.send('delete', `/admin/groups/${id}`);
      expectStatus(await admin.send('post', '/admin/groups', { name: 'Membres' }), 201);
    });

    it('version périmée → 409 EDIT_CONFLICT', async () => {
      const id = await createGroup(admin, 'Membres');
      expectStatus(
        await admin.send('patch', `/admin/groups/${id}`, { name: 'A', version: 1 }),
        200,
      );
      const stale = await admin.send('patch', `/admin/groups/${id}`, { name: 'B', version: 1 });
      expect(stale.status).toBe(409);
      expect(stale.body.code).toBe('EDIT_CONFLICT');
    });

    it('routes des groupes → 404 pour un non-admin', async () => {
      await createUser(admin, 'kira', 'temporaire-kira');
      const kira = new TestClient(app);
      await kira.login('kira', 'temporaire-kira');
      await kira.send('post', '/auth/change-credentials', {
        currentPassword: 'temporaire-kira',
        newPassword: 'mot-de-passe-kira',
      });
      expect((await kira.get('/admin/groups')).status).toBe(404);
      expect((await kira.get('/admin/rights/matrix')).status).toBe(404);
    });
  });

  describe('membres', () => {
    it('depuis la fiche du groupe et depuis la fiche de l’utilisateur', async () => {
      const kira = await createUser(admin, 'kira');
      const bob = await createUser(admin, 'bob');
      const members = await createGroup(admin, 'Membres');
      const officers = await createGroup(admin, 'Officiers');

      const res = await admin.send('put', `/admin/groups/${members}/members`, {
        userIds: [kira, bob],
      });
      expectStatus(res, 200);
      expect((res.body as GroupDetail).members.map((m) => m.username)).toEqual(['bob', 'kira']);

      const user = await admin.send('put', `/admin/users/${kira}/groups`, {
        groupIds: [officers],
      });
      expectStatus(user, 200);
      expect((user.body as UserDetail).groups.map((g) => g.name)).toEqual(['Officiers']);
      const group = (await admin.get(`/admin/groups/${members}`)).body as GroupDetail;
      expect(group.members.map((m) => m.username)).toEqual(['bob']);

      const list = await admin.get(`/admin/users?groupId=${officers}`);
      expect(list.body.items.map((u: { username: string }) => u.username)).toEqual(['kira']);
    });

    it('création d’un compte avec ses groupes', async () => {
      const members = await createGroup(admin, 'Membres');
      const res = await admin.send('post', '/admin/users', {
        username: 'kira',
        temporaryPassword: 'mot-de-passe-temporaire',
        groupIds: [members],
      });
      expectStatus(res, 201);
      expect((res.body as UserDetail).groups.map((g) => g.name)).toEqual(['Membres']);
    });

    it('compte ou groupe inconnu → 400 VALIDATION_FAILED', async () => {
      const members = await createGroup(admin, 'Membres');
      const kira = await createUser(admin, 'kira');
      const unknown = '0190f5c0-0000-7000-8000-00000000ffff';
      const badUser = await admin.send('put', `/admin/groups/${members}/members`, {
        userIds: [unknown],
      });
      expect(badUser.status).toBe(400);
      const badGroup = await admin.send('put', `/admin/users/${kira}/groups`, {
        groupIds: [unknown],
      });
      expect(badGroup.status).toBe(400);
    });
  });

  describe('permissions', () => {
    it('remplace les permissions et les renvoie avec le nom de la ressource', async () => {
      const home = await createPage('Accueil');
      const id = await createGroup(admin, 'Partie commune');
      const res = await admin.send('put', `/admin/groups/${id}/permissions`, {
        permissions: [
          pagePermission(home),
          pagePermission(await createPage('Vide'), { canRead: false }),
        ],
      });
      expectStatus(res, 200);
      expect((res.body as GroupDetail).permissions).toEqual([
        { ...pagePermission(home), resourceName: 'Accueil' },
      ]);
    });

    it('canCreateTopic ou canPost sur une page → 400 VALIDATION_FAILED', async () => {
      const home = await createPage('Accueil');
      const id = await createGroup(admin, 'Membres');
      for (const rights of [{ canPost: true }, { canCreateTopic: true }]) {
        const res = await admin.send('put', `/admin/groups/${id}/permissions`, {
          permissions: [pagePermission(home, rights)],
        });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_FAILED');
        expect(res.body.details.fields).toEqual({ 'permissions.0': ['pageReadOnly'] });
      }
    });

    it('ressource inconnue, supprimée ou en double → 400', async () => {
      const id = await createGroup(admin, 'Membres');
      const home = await createPage('Accueil');
      const gone = await createPage('Ancienne');
      await admin.send('delete', `/admin/pages/${gone}`);
      const res = await admin.send('put', `/admin/groups/${id}/permissions`, {
        permissions: [pagePermission(home), pagePermission(home), pagePermission(gone)],
      });
      expect(res.status).toBe(400);
      expect(res.body.details.fields).toEqual({ 'permissions.1.resourceId': ['duplicate'] });

      const missing = await admin.send('put', `/admin/groups/${id}/permissions`, {
        permissions: [pagePermission(gone), { ...pagePermission(home), resourceType: 'space' }],
      });
      expect(missing.status).toBe(400);
      expect(missing.body.details.fields).toEqual({
        'permissions.0.resourceId': ['notFound'],
        'permissions.1.resourceId': ['notFound'],
      });
    });

    it('les contraintes CHECK refusent aussi en base', async () => {
      const home = await createPage('Accueil');
      const id = await createGroup(admin, 'Membres');
      const insert = (pageId: string | null, canRead: boolean, canPost: boolean) =>
        prisma.$executeRawUnsafe(
          `INSERT INTO group_permissions (id, group_id, page_id, can_read, can_post)
           VALUES (uuidv7(), $1::uuid, $2::uuid, $3, $4)`,
          id,
          pageId,
          canRead,
          canPost,
        );
      await expect(insert(home, true, true)).rejects.toThrow(/group_permissions_page_read_only/);
      await expect(insert(null, true, false)).rejects.toThrow(/group_permissions_single_target/);
      await expect(insert(home, true, false)).resolves.toBe(1);
    });
  });

  describe('journal', () => {
    it('groupes, membres, permissions et groupes d’un compte tracés', async () => {
      const kira = await createUser(admin, 'kira');
      const home = await createPage('Accueil');
      const id = await createGroup(admin, 'Membres', { userIds: [kira], pageIds: [home] });
      await admin.send('patch', `/admin/groups/${id}`, { name: 'Joueurs', version: 1 });
      await admin.send('put', `/admin/users/${kira}/groups`, { groupIds: [] });
      await admin.send('delete', `/admin/groups/${id}`);

      const log = await prisma.auditLog.findMany({
        where: { OR: [{ targetType: 'group' }, { action: 'user.groups' }] },
        orderBy: { id: 'asc' },
      });
      expect(log.map((e) => e.action)).toEqual([
        'group.create',
        'group.members',
        'group.permissions',
        'group.update',
        'user.groups',
        'group.delete',
      ]);
      expect(log[1]!.after).toEqual({ name: 'Membres', members: ['kira'] });
      expect(log[2]!.after).toEqual({ name: 'Membres', permissions: ['Accueil (L)'] });
      expect(log[4]!.before).toEqual({ username: 'kira', groups: ['Joueurs'] });
      expect(log[4]!.after).toEqual({ username: 'kira', groups: [] });
    });
  });
});
