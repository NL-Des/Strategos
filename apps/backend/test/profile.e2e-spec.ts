import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Profile } from '@strategos/shared';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  TestClient,
  adminClient,
  createGroup,
  createTestApp,
  expectStatus,
  meId,
  resetDatabase,
  userClient,
} from './helpers.js';

const PASSWORD = 'mot-de-passe-utilisateur';

describe('Profil (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: TestClient;
  let kira: TestClient;
  let kiraId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    admin = await adminClient(app);
    kira = await userClient(app, admin, 'kira');
    kiraId = await meId(kira);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('page administrative', () => {
    it('pseudo, création, statut, groupes et droits : le même calcul que la vue admin', async () => {
      const home = (await admin.send('post', '/admin/pages', { name: 'Accueil' })).body.id;
      await createGroup(admin, 'Partie commune', { userIds: [kiraId], pageIds: [home] });

      const res = await kira.get('/me/profile');
      expectStatus(res, 200);
      const profile = res.body as Profile;
      expect(profile).toMatchObject({ id: kiraId, username: 'kira', status: 'active' });
      expect(profile.createdAt).toEqual(expect.any(String));
      expect(profile.rights).toEqual((await admin.get(`/admin/rights/users/${kiraId}`)).body);
      expect(profile.rights.resources[0]!.rights.read.map((g) => g.name)).toEqual([
        'Partie commune',
      ]);
      expect(JSON.stringify(profile)).not.toContain('argon2');
    });

    it('chacun ne voit que son propre profil', async () => {
      const bob = await userClient(app, admin, 'bob');
      expect((await bob.get('/me/profile')).body.username).toBe('bob');
      expect((await new TestClient(app).get('/me/profile')).status).toBe(401);
    });
  });

  describe('changement du mot de passe', () => {
    it('ancien mot de passe exigé ; succès → 204, autres sessions fermées, action tracée', async () => {
      const other = new TestClient(app);
      expectStatus(await other.login('kira', PASSWORD), 200);

      const wrong = await kira.send('put', '/me/password', {
        currentPassword: 'faux-mot-de-passe',
        newPassword: 'nouveau-mot-de-passe',
      });
      expect(wrong.status).toBe(401);
      expect(wrong.body.code).toBe('AUTH_INVALID_CREDENTIALS');

      const same = await kira.send('put', '/me/password', {
        currentPassword: PASSWORD,
        newPassword: PASSWORD,
      });
      expect(same.status).toBe(400);

      const ok = await kira.send('put', '/me/password', {
        currentPassword: PASSWORD,
        newPassword: 'nouveau-mot-de-passe',
      });
      expect(ok.status).toBe(204);
      expect((await kira.get('/me/profile')).status).toBe(200);
      expect((await other.get('/me/profile')).status).toBe(401);
      expectStatus(await new TestClient(app).login('kira', 'nouveau-mot-de-passe'), 200);

      const entry = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'user.change_password', targetId: kiraId },
      });
      expect(entry.actorId).toBe(kiraId);
    });

    it('limité comme la connexion : 5 échecs → 429 AUTH_TOO_MANY_ATTEMPTS', async () => {
      for (let i = 0; i < 5; i++) {
        const res = await kira.send('put', '/me/password', {
          currentPassword: 'faux-mot-de-passe',
          newPassword: 'nouveau-mot-de-passe',
        });
        expect(res.status).toBe(401);
      }
      const blocked = await kira.send('put', '/me/password', {
        currentPassword: PASSWORD,
        newPassword: 'nouveau-mot-de-passe',
      });
      expect(blocked.status).toBe(429);
      expect(blocked.body.code).toBe('AUTH_TOO_MANY_ATTEMPTS');
    });

    it('interdit tant que le changement d’identifiants est exigé', async () => {
      await admin.send('post', '/admin/users', {
        username: 'bob',
        temporaryPassword: 'temporaire-bob-1',
      });
      const bob = new TestClient(app);
      await bob.login('bob', 'temporaire-bob-1');
      const res = await bob.send('put', '/me/password', {
        currentPassword: 'temporaire-bob-1',
        newPassword: 'nouveau-mot-de-passe',
      });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CREDENTIALS_CHANGE_REQUIRED');
    });
  });
});
