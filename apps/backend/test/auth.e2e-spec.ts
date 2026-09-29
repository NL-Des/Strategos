import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  ADMIN_PASSWORD,
  ORIGIN,
  TestClient,
  adminClient,
  createTestApp,
  createUser,
  resetDatabase,
} from './helpers.js';

describe('Authentification (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('session', () => {
    it('cookie httpOnly, SameSite=Strict, sans secure hors production', async () => {
      const res = await new TestClient(app).login('admin', 'admin');
      expect(res.status).toBe(200);
      const cookie = ([] as string[])
        .concat(res.headers['set-cookie'] ?? [])
        .find((c) => c.startsWith('strategos_session='));
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Strict/);
      expect(cookie).not.toMatch(/Secure/);
    });

    it('la connexion fait tourner la session : l’ancienne est révoquée', async () => {
      const client = new TestClient(app);
      await client.login('admin', 'admin');
      const [before] = await prisma.session.findMany();
      await client.login('admin', 'admin');
      const after = await prisma.session.findMany();
      expect(after).toHaveLength(1);
      expect(after[0]!.id).not.toBe(before!.id);
    });

    it('le jeton de session n’est stocké que sous forme d’empreinte', async () => {
      const res = await new TestClient(app).login('admin', 'admin');
      const token = /strategos_session=([^;]+)/.exec(String(res.headers['set-cookie']))![1]!;
      const [session] = await prisma.session.findMany();
      expect(session!.id).not.toBe(token);
      expect(session!.id).toMatch(/^[0-9a-f]{64}$/);
    });

    it('sans session → 401 UNAUTHENTICATED', async () => {
      const res = await new TestClient(app).get('/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    });

    it('session glissante : le cookie est prolongé avec la session', async () => {
      const client = new TestClient(app);
      await client.login('admin', 'admin');
      // Dernière activité il y a 2 minutes : la requête suivante prolonge la session.
      await prisma.session.updateMany({ data: { lastSeenAt: new Date(Date.now() - 120_000) } });
      const res = await client.get('/auth/me');
      expect(res.status).toBe(200);
      const cookie = ([] as string[])
        .concat(res.headers['set-cookie'] ?? [])
        .find((c) => c.startsWith('strategos_session='));
      expect(cookie).toMatch(/Max-Age=604800/);
      // Sans prolongation (moins d'une minute), le cookie n'est pas renvoyé.
      const again = await client.get('/auth/me');
      expect(String(again.headers['set-cookie'] ?? '')).not.toMatch(/strategos_session=/);
    });

    it('déconnexion → session révoquée', async () => {
      const client = new TestClient(app);
      await client.login('admin', 'admin');
      expect((await client.send('post', '/auth/logout')).status).toBe(204);
      expect((await client.get('/auth/me')).status).toBe(401);
      expect(await prisma.session.count()).toBe(0);
    });
  });

  describe('mots de passe', () => {
    it('hachés en argon2id, jamais renvoyés par l’API', async () => {
      const admin = await adminClient(app);
      await createUser(admin, 'kira');
      const user = await prisma.user.findFirstOrThrow({ where: { username: 'kira' } });
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);

      const responses = [
        await admin.get('/auth/me'),
        await admin.get('/admin/users'),
        await admin.get(`/admin/users/${user.id}`),
      ];
      for (const res of responses) {
        expect(JSON.stringify(res.body)).not.toMatch(/argon2|passwordHash|password_hash/);
      }
    });

    it('pseudo insensible à la casse à la connexion', async () => {
      const res = await new TestClient(app).login('ADMIN', 'admin');
      expect(res.status).toBe(200);
    });

    it('identifiants faux → 401 AUTH_INVALID_CREDENTIALS, compte inexistant compris', async () => {
      for (const [u, p] of [
        ['admin', 'faux'],
        ['personne', 'faux'],
      ]) {
        const res = await new TestClient(app).login(u!, p!);
        expect(res.status).toBe(401);
        expect(res.body.code).toBe('AUTH_INVALID_CREDENTIALS');
      }
    });
  });

  describe('limitation des tentatives', () => {
    it('5 échecs sur un compte → 429 avec retryAfter, même depuis une autre IP', async () => {
      for (let i = 0; i < 5; i++) {
        expect((await new TestClient(app).login('admin', 'faux')).status).toBe(401);
      }
      const res = await new TestClient(app).login('admin', 'admin');
      expect(res.status).toBe(429);
      expect(res.body.code).toBe('AUTH_TOO_MANY_ATTEMPTS');
      expect(res.body.details.retryAfter).toBeGreaterThan(14 * 60);
      expect(res.body.details.retryAfter).toBeLessThanOrEqual(15 * 60);
    });

    it('5 échecs depuis une IP → 429 sur tout compte depuis cette IP', async () => {
      const client = new TestClient(app);
      for (let i = 0; i < 5; i++) {
        expect((await client.login(`inconnu${i}`, 'faux')).status).toBe(401);
      }
      expect((await client.login('admin', 'admin')).status).toBe(429);
      expect((await new TestClient(app).login('admin', 'admin')).status).toBe(200);
    });

    it('un succès remet le compteur à zéro', async () => {
      const client = new TestClient(app);
      for (let i = 0; i < 4; i++) await client.login('admin', 'faux');
      expect((await client.login('admin', 'admin')).status).toBe(200);
      for (let i = 0; i < 4; i++) await client.login('admin', 'faux');
      expect((await client.login('admin', 'admin')).status).toBe(200);
    });
  });

  describe('CSRF', () => {
    const server = () => request(app.getHttpServer());
    const credentials = { username: 'admin', password: 'admin' };

    it('sans jeton → 403 CSRF_INVALID', async () => {
      const res = await server().post('/api/v1/auth/login').set('Origin', ORIGIN).send(credentials);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CSRF_INVALID');
    });

    it('jeton faux, Origin étranger ou absent → 403 CSRF_INVALID', async () => {
      const agent = request.agent(app.getHttpServer());
      const { csrfToken } = (await agent.get('/api/v1/auth/csrf')).body as { csrfToken: string };
      const attempts = [
        { origin: ORIGIN, token: 'faux' },
        { origin: 'https://evil.example', token: csrfToken },
        { origin: undefined, token: csrfToken },
      ];
      for (const { origin, token } of attempts) {
        const req = agent.post('/api/v1/auth/login').set('X-CSRF-Token', token);
        if (origin) req.set('Origin', origin);
        const res = await req.send(credentials);
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('CSRF_INVALID');
      }
      const ok = await agent
        .post('/api/v1/auth/login')
        .set('Origin', ORIGIN)
        .set('X-CSRF-Token', csrfToken)
        .send(credentials);
      expect(ok.status).toBe(200);
    });

    it('le jeton d’une pré-session ne vaut plus après connexion', async () => {
      const client = new TestClient(app);
      const agent = client.agent;
      const { csrfToken } = (await agent.get('/api/v1/auth/csrf')).body as { csrfToken: string };
      await agent
        .post('/api/v1/auth/login')
        .set('Origin', ORIGIN)
        .set('X-CSRF-Token', csrfToken)
        .send(credentials)
        .expect(200);
      const res = await agent
        .post('/api/v1/auth/logout')
        .set('Origin', ORIGIN)
        .set('X-CSRF-Token', csrfToken);
      expect(res.status).toBe(403);
    });
  });

  describe('changement d’identifiants forcé', () => {
    it('seules me, change-credentials et logout répondent ; le reste → 403', async () => {
      const client = new TestClient(app);
      await client.login('admin', 'admin');
      expect((await client.get('/auth/me')).body.mustChangeCredentials).toBe(true);
      const blocked = await client.get('/admin/users');
      expect(blocked.status).toBe(403);
      expect(blocked.body.code).toBe('CREDENTIALS_CHANGE_REQUIRED');

      const changed = await client.send('post', '/auth/change-credentials', {
        currentPassword: 'admin',
        newPassword: ADMIN_PASSWORD,
        newUsername: 'nadia',
      });
      expect(changed.status).toBe(200);
      expect(changed.body).toMatchObject({ username: 'nadia', mustChangeCredentials: false });
      expect((await client.get('/admin/users')).status).toBe(200);
    });

    it('l’admin doit choisir un nouveau pseudo', async () => {
      const client = new TestClient(app);
      await client.login('admin', 'admin');
      const missing = await client.send('post', '/auth/change-credentials', {
        currentPassword: 'admin',
        newPassword: ADMIN_PASSWORD,
      });
      expect(missing.status).toBe(400);
      expect(missing.body.details.fields.newUsername).toEqual(['isNotEmpty']);
      const same = await client.send('post', '/auth/change-credentials', {
        currentPassword: 'admin',
        newPassword: ADMIN_PASSWORD,
        newUsername: 'ADMIN',
      });
      expect(same.status).toBe(400);
      expect(same.body.details.fields.newUsername).toEqual(['sameAsCurrent']);
    });

    it('newUsername refusé pour un non-admin', async () => {
      const admin = await adminClient(app);
      await createUser(admin, 'kira', 'temporaire-kira');
      const kira = new TestClient(app);
      await kira.login('kira', 'temporaire-kira');
      const res = await kira.send('post', '/auth/change-credentials', {
        currentPassword: 'temporaire-kira',
        newPassword: 'nouveau-mot-de-passe',
        newUsername: 'kira2',
      });
      expect(res.status).toBe(400);
      expect(res.body.details.fields.newUsername).toEqual(['notAllowed']);

      const ok = await kira.send('post', '/auth/change-credentials', {
        currentPassword: 'temporaire-kira',
        newPassword: 'nouveau-mot-de-passe',
      });
      expect(ok.status).toBe(200);
      expect(ok.body.mustChangeCredentials).toBe(false);
    });

    it('mot de passe actuel faux, trop court ou identique → refusé', async () => {
      const client = new TestClient(app);
      await client.login('admin', 'admin');
      const wrong = await client.send('post', '/auth/change-credentials', {
        currentPassword: 'faux',
        newPassword: ADMIN_PASSWORD,
        newUsername: 'nadia',
      });
      expect(wrong.body.code).toBe('AUTH_INVALID_CREDENTIALS');
      const short = await client.send('post', '/auth/change-credentials', {
        currentPassword: 'admin',
        newPassword: 'court',
        newUsername: 'nadia',
      });
      expect(short.status).toBe(400);
      expect(short.body.details.fields.newPassword).toContain('isLength');
    });

    it('les autres sessions du compte sont révoquées', async () => {
      const first = new TestClient(app);
      const second = new TestClient(app);
      await first.login('admin', 'admin');
      await second.login('admin', 'admin');
      await first.send('post', '/auth/change-credentials', {
        currentPassword: 'admin',
        newPassword: ADMIN_PASSWORD,
        newUsername: 'nadia',
      });
      expect((await first.get('/auth/me')).status).toBe(200);
      expect((await second.get('/auth/me')).status).toBe(401);
    });
  });
});
