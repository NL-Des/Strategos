import type { NestExpressApplication } from '@nestjs/platform-express';
import type { AuditEntry } from '@strategos/shared';
import { CLI_ACTOR } from '../src/audit/audit-actor.js';
import { AuditService } from '../src/audit/audit.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UsersService } from '../src/users/users.service.js';
import {
  ADMIN_PASSWORD,
  TestClient,
  adminClient,
  createTestApp,
  createUser,
  expectStatus,
  resetDatabase,
} from './helpers.js';

describe('Journal des modifications (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: TestClient;
  let adminId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    admin = await adminClient(app);
    adminId = (await prisma.user.findFirstOrThrow({ where: { isAdmin: true } })).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const entries = async (query = ''): Promise<AuditEntry[]> => {
    const res = await admin.get(`/admin/audit?pageSize=200${query}`);
    expectStatus(res, 200);
    return res.body.items as AuditEntry[];
  };

  describe('intégrité', () => {
    it('UPDATE et DELETE sur audit_log échouent en base (trigger)', async () => {
      expect(await prisma.auditLog.count()).toBeGreaterThan(0);
      await expect(prisma.$executeRawUnsafe(`UPDATE audit_log SET action = 'x'`)).rejects.toThrow(
        /ajout seul/,
      );
      await expect(prisma.$executeRawUnsafe('DELETE FROM audit_log')).rejects.toThrow(/ajout seul/);
    });

    it('aucune route ne modifie ni ne supprime le journal', async () => {
      const [entry] = await entries();
      for (const method of ['post', 'put', 'patch', 'delete'] as const) {
        for (const path of ['/admin/audit', `/admin/audit/${entry!.id}`]) {
          const res = await admin.send(method, path, {});
          expect(res.status).toBe(404);
        }
      }
      expect(await entries()).toHaveLength(1);
    });

    it('le journal refuse une écriture hors transaction', async () => {
      await expect(
        app.get(AuditService).record(
          prisma,
          { kind: 'system' },
          {
            action: 'user.create',
            targetType: 'user',
          },
        ),
      ).rejects.toThrow(/transaction/);
    });

    it('une modification dont la transaction échoue ne laisse aucune entrée', async () => {
      await createUser(admin, 'kira');
      const count = await prisma.auditLog.count();
      const taken = await admin.send('post', '/admin/users', {
        username: 'kira',
        temporaryPassword: 'mot-de-passe-temporaire',
      });
      expect(taken.status).toBe(409);
      expect(await prisma.auditLog.count()).toBe(count);
    });

    it('si l’écriture au journal échoue, la modification est annulée', async () => {
      const ghost = {
        kind: 'user' as const,
        userId: '0190f5c0-0000-7000-8000-000000000000',
        ip: null,
      };
      await expect(
        app
          .get(UsersService)
          .create({ username: 'fantome', temporaryPassword: 'mot-de-passe-temporaire' }, ghost),
      ).rejects.toThrow();
      expect(await prisma.user.count({ where: { username: 'fantome' } })).toBe(0);
    });
  });

  describe('actions de l’étape 1', () => {
    it('trace les actions de l’admin sur un compte, avec avant/après et sans hash', async () => {
      const id = await createUser(admin, 'kira');
      await admin.send('patch', `/admin/users/${id}`, { username: 'kira2', version: 1 });
      await admin.send('post', `/admin/users/${id}/reset-password`, {
        temporaryPassword: 'nouveau-temporaire',
      });
      await admin.send('post', `/admin/users/${id}/disable`);
      await admin.send('post', `/admin/users/${id}/enable`);
      await admin.send('delete', `/admin/users/${id}`);

      const log = (await entries(`&targetId=${id}`)).reverse();
      expect(log.map((e) => e.action)).toEqual([
        'user.create',
        'user.rename',
        'user.reset_password',
        'user.disable',
        'user.enable',
        'user.delete',
      ]);
      for (const entry of log) {
        expect(entry).toMatchObject({
          actorKind: 'user',
          actor: { id: adminId },
          targetType: 'user',
          targetId: id,
        });
        expect(entry.ip).toMatch(/^10\./);
        expect(JSON.stringify(entry)).not.toMatch(/argon2|passwordHash/);
      }
      expect(log[1]).toMatchObject({ before: { username: 'kira' }, after: { username: 'kira2' } });
      expect(log[3]).toMatchObject({ before: { status: 'active' }, after: { status: 'disabled' } });
      expect(log[5]).toMatchObject({ before: { deleted: false }, after: { deleted: true } });
    });

    it('trace le changement d’identifiants par l’utilisateur lui-même', async () => {
      const [entry] = await entries('&action=user.change_credentials');
      expect(entry).toMatchObject({
        actorKind: 'user',
        actor: { id: adminId },
        targetId: adminId,
        before: { username: 'admin', mustChangeCredentials: true },
        after: { mustChangeCredentials: false },
      });
    });

    it('trace la commande serveur avec l’acteur « cli »', async () => {
      await app.get(UsersService).resetAdmin();
      const row = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'user.reset_password', actorKind: 'cli' },
      });
      expect(row).toMatchObject({ actorId: null, ip: null, targetId: adminId });
    });

    it('les actions refusées ne sont pas tracées', async () => {
      const count = await prisma.auditLog.count();
      await admin.send('post', `/admin/users/${adminId}/disable`);
      await admin.send('patch', `/admin/users/${adminId}`, { username: 'x', version: 99 });
      expect(await prisma.auditLog.count()).toBe(count);
    });
  });

  describe('consultation', () => {
    it('paginé, du plus récent au plus ancien', async () => {
      for (const name of ['a1', 'a2', 'a3']) await createUser(admin, name);
      const res = await admin.get('/admin/audit?pageSize=2');
      expect(res.body).toMatchObject({ total: 4, page: 1, pageSize: 2 });
      expect(res.body.items.map((e: AuditEntry) => e.after)).toMatchObject([
        { username: 'a3' },
        { username: 'a2' },
      ]);
      const page2 = await admin.get('/admin/audit?pageSize=2&page=2');
      expect(page2.body.items).toHaveLength(2);
    });

    it('filtrable par acteur, action, type de cible et période', async () => {
      await createUser(admin, 'kira');
      // Entrée « cli » écrite directement : resetAdmin() fermerait la session de l'admin.
      await prisma.$transaction((tx) =>
        app.get(AuditService).record(tx, CLI_ACTOR, {
          action: 'user.reset_password',
          targetType: 'user',
          targetId: adminId,
        }),
      );

      expect((await entries(`&actorId=${adminId}`)).map((e) => e.action).sort()).toEqual([
        'user.change_credentials',
        'user.create',
      ]);
      expect(await entries('&actorKind=cli')).toHaveLength(1);
      expect(await entries('&action=user.create')).toHaveLength(1);
      expect(await entries('&targetType=user')).toHaveLength(3);

      const future = new Date(Date.now() + 60_000).toISOString();
      const past = new Date(Date.now() - 60_000).toISOString();
      expect(await entries(`&from=${future}`)).toHaveLength(0);
      expect(await entries(`&from=${past}&to=${future}`)).toHaveLength(3);
      expect(await entries(`&to=${past}`)).toHaveLength(0);
    });

    it('filtres invalides → 400 ; non-admin → 404', async () => {
      expect((await admin.get('/admin/audit?actorKind=robot')).status).toBe(400);
      expect((await admin.get('/admin/audit?from=hier')).status).toBe(400);

      await createUser(admin, 'kira', 'temporaire-kira');
      const kira = new TestClient(app);
      await kira.login('kira', 'temporaire-kira');
      await kira.send('post', '/auth/change-credentials', {
        currentPassword: 'temporaire-kira',
        newPassword: ADMIN_PASSWORD,
      });
      expect((await kira.get('/admin/audit')).status).toBe(404);
    });
  });
});
