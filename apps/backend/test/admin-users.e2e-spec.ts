import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UsersService } from '../src/users/users.service.js';
import {
  TestClient,
  adminClient,
  createTestApp,
  createUser,
  expectStatus,
  resetDatabase,
} from './helpers.js';

describe('Comptes, côté admin (e2e)', () => {
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

  /** Kira, connectée avec son mot de passe temporaire. */
  async function kiraLoggedIn(): Promise<{ id: string; kira: TestClient }> {
    const id = await createUser(admin, 'kira', 'temporaire-kira');
    const kira = new TestClient(app);
    expectStatus(await kira.login('kira', 'temporaire-kira'), 200);
    return { id, kira };
  }

  it('création → mot de passe temporaire, changement forcé', async () => {
    const res = await admin.send('post', '/admin/users', {
      username: '  Kira ',
      temporaryPassword: 'temporaire-kira',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      username: 'Kira',
      status: 'active',
      mustChangeCredentials: true,
    });
    const kira = new TestClient(app);
    expect((await kira.login('kira', 'temporaire-kira')).body.mustChangeCredentials).toBe(true);
  });

  it('pseudo déjà pris (casse ignorée) → 409 USERNAME_TAKEN ; réutilisable après suppression', async () => {
    const id = await createUser(admin, 'kira');
    const taken = await admin.send('post', '/admin/users', {
      username: 'KIRA',
      temporaryPassword: 'mot-de-passe-temporaire',
    });
    expect(taken.status).toBe(409);
    expect(taken.body.code).toBe('USERNAME_TAKEN');

    expect((await admin.send('delete', `/admin/users/${id}`)).status).toBe(204);
    await createUser(admin, 'kira');
  });

  it('mot de passe temporaire trop court → 400 VALIDATION_FAILED', async () => {
    const res = await admin.send('post', '/admin/users', {
      username: 'kira',
      temporaryPassword: 'court',
    });
    expect(res.status).toBe(400);
    expect(res.body.details.fields.temporaryPassword).toContain('isLength');
  });

  it('liste paginée, filtrable par statut et recherche ; pageSize plafonné à 200', async () => {
    const kiraId = await createUser(admin, 'kira');
    await createUser(admin, 'borin');
    await admin.send('post', `/admin/users/${kiraId}/disable`);

    const all = await admin.get('/admin/users?pageSize=2');
    expect(all.body).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    expect(all.body.items.map((u: { username: string }) => u.username)).toEqual(['admin', 'borin']);

    const disabled = await admin.get('/admin/users?status=disabled');
    expect(disabled.body.items.map((u: { username: string }) => u.username)).toEqual(['kira']);
    const search = await admin.get('/admin/users?q=OR');
    expect(search.body.items.map((u: { username: string }) => u.username)).toEqual(['borin']);
    expect((await admin.get('/admin/users?pageSize=201')).status).toBe(400);
  });

  it('modification du pseudo avec version périmée → 409 EDIT_CONFLICT', async () => {
    const id = await createUser(admin, 'kira');
    const ok = await admin.send('patch', `/admin/users/${id}`, { username: 'kira2', version: 1 });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ username: 'kira2', version: 2 });
    const stale = await admin.send('patch', `/admin/users/${id}`, {
      username: 'kira3',
      version: 1,
    });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('EDIT_CONFLICT');
  });

  it('réinitialisation → mot de passe temporaire, drapeau, sessions révoquées', async () => {
    const { id, kira } = await kiraLoggedIn();
    await kira.send('post', '/auth/change-credentials', {
      currentPassword: 'temporaire-kira',
      newPassword: 'mot-de-passe-kira',
    });
    const res = await admin.send('post', `/admin/users/${id}/reset-password`, {
      temporaryPassword: 'nouveau-temporaire',
    });
    expect(res.body.mustChangeCredentials).toBe(true);
    expect((await kira.get('/auth/me')).status).toBe(401);
    expect((await new TestClient(app).login('kira', 'nouveau-temporaire')).status).toBe(200);
  });

  it('désactivation → sessions révoquées, connexion refusée ; réactivation', async () => {
    const { id, kira } = await kiraLoggedIn();
    const res = await admin.send('post', `/admin/users/${id}/disable`);
    expect(res.body.status).toBe('disabled');
    expect((await kira.get('/auth/me')).status).toBe(401);

    const refused = await new TestClient(app).login('kira', 'temporaire-kira');
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe('AUTH_ACCOUNT_DISABLED');
    const wrongPassword = await new TestClient(app).login('kira', 'faux');
    expect(wrongPassword.body.code).toBe('AUTH_INVALID_CREDENTIALS');

    await admin.send('post', `/admin/users/${id}/enable`);
    expect((await new TestClient(app).login('kira', 'temporaire-kira')).status).toBe(200);
  });

  it('suppression → sessions révoquées, connexion refusée, fiche introuvable', async () => {
    const { id, kira } = await kiraLoggedIn();
    expect((await admin.send('delete', `/admin/users/${id}`)).status).toBe(204);
    expect((await kira.get('/auth/me')).status).toBe(401);
    const refused = await new TestClient(app).login('kira', 'temporaire-kira');
    expect(refused.body.code).toBe('AUTH_ACCOUNT_DISABLED');
    expect((await admin.get(`/admin/users/${id}`)).status).toBe(404);
    const row = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(row.deletedAt).not.toBeNull();
  });

  it('le compte admin ne se désactive, ne se supprime ni ne se réinitialise par le web', async () => {
    const { id } = await prisma.user.findFirstOrThrow({ where: { isAdmin: true } });
    for (const res of [
      await admin.send('post', `/admin/users/${id}/disable`),
      await admin.send('delete', `/admin/users/${id}`),
      await admin.send('post', `/admin/users/${id}/reset-password`, {
        temporaryPassword: 'nouveau-temporaire',
      }),
    ]) {
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('ADMIN_ACCOUNT_PROTECTED');
    }
  });

  it('non-admin sur /admin → 404 ; compte inconnu → 404', async () => {
    const { kira } = await kiraLoggedIn();
    await kira.send('post', '/auth/change-credentials', {
      currentPassword: 'temporaire-kira',
      newPassword: 'mot-de-passe-kira',
    });
    const res = await kira.get('/admin/users');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect((await admin.get('/admin/users/0190f5c0-0000-7000-8000-000000000000')).status).toBe(404);
  });

  it('commande serveur : mot de passe temporaire, drapeau, sessions révoquées', async () => {
    const { username, temporaryPassword } = await app.get(UsersService).resetAdmin();
    expect(temporaryPassword.length).toBeGreaterThanOrEqual(12);
    expect((await admin.get('/auth/me')).status).toBe(401);
    const res = await new TestClient(app).login(username, temporaryPassword);
    expect(res.status).toBe(200);
    expect(res.body.mustChangeCredentials).toBe(true);
  });
});
