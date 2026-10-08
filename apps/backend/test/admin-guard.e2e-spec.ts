import { ModulesContainer } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { IS_ADMIN } from '../src/auth/decorators.js';
import {
  TestClient,
  adminClient,
  createTestApp,
  createUser,
  meId,
  resetDatabase,
  userClient,
} from './helpers.js';

/** Chemins déclarés par `@Controller()` ou par un décorateur de route, sans barre initiale. */
function pathsOf(target: object): string[] {
  const path = Reflect.getMetadata('path', target) as string | string[] | undefined;
  return (Array.isArray(path) ? path : [path ?? '']).map((p) => p.replace(/^\/+/, ''));
}

describe('Espace admin réservé à l’admin (e2e)', () => {
  let app: NestExpressApplication;
  let admin: TestClient;
  let mallory: TestClient;
  let aliceId: string;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    admin = await adminClient(app);
    aliceId = await createUser(admin, 'alice');
    mallory = await userClient(app, admin, 'mallory');
  });

  afterAll(async () => {
    await app.close();
  });

  it('toute route sous `admin/` porte `@AdminOnly()`, et aucune autre', () => {
    const routes: { name: string; path: string; adminOnly: boolean }[] = [];
    for (const module of app.get(ModulesContainer).values()) {
      for (const { metatype } of module.controllers.values()) {
        if (!metatype) continue;
        const prototype = metatype.prototype as Record<string, object>;
        for (const key of Object.getOwnPropertyNames(prototype)) {
          const handler = prototype[key]!;
          if (key === 'constructor' || Reflect.getMetadata('method', handler) === undefined) {
            continue;
          }
          const adminOnly = !!(
            Reflect.getMetadata(IS_ADMIN, handler) ?? Reflect.getMetadata(IS_ADMIN, metatype)
          );
          for (const prefix of pathsOf(metatype)) {
            for (const suffix of pathsOf(handler)) {
              const path = [prefix, suffix].filter(Boolean).join('/');
              routes.push({ name: `${metatype.name}.${key}`, path, adminOnly });
            }
          }
        }
      }
    }
    expect(routes.length).toBeGreaterThan(100);
    const isAdminPath = (path: string) => /^admin(\/|$)/i.test(path);
    expect(routes.filter((r) => isAdminPath(r.path) && !r.adminOnly)).toEqual([]);
    expect(routes.filter((r) => !isAdminPath(r.path) && r.adminOnly)).toEqual([]);
    expect(routes.some((r) => r.adminOnly)).toBe(true);
  });

  it('un compte ordinaire reçoit 404, quelle que soit la casse de l’adresse', async () => {
    const adminId = await meId(admin);
    const gets = [
      '/admin/users',
      '/Admin/users',
      '/ADMIN/users',
      '/admin/Users',
      `/Admin/users/${aliceId}/notes`,
      '/Admin/audit',
      '/Admin/settings',
      '/Admin/backups',
      '/Admin/trash',
      '/Admin/google/status',
      '/admin/google/status',
      '/admin/onedrive/status',
    ];
    for (const path of gets) {
      expect([path, (await mallory.get(path)).status]).toEqual([path, 404]);
    }
    // Préfixe global en majuscules : hors de `get`, qui ajoute `/api/v1`.
    for (const path of ['/API/V1/ADMIN/users', '/api/V1/admin/users', '/Api/v1/Admin/users']) {
      expect([path, (await mallory.agent.get(path)).status]).toEqual([path, 404]);
    }

    const writes: ['post' | 'put' | 'delete', string, object?][] = [
      ['post', '/Admin/users', { username: 'intrus', temporaryPassword: 'mot-de-passe-intrus' }],
      ['post', '/admin/users', { username: 'intrus', temporaryPassword: 'mot-de-passe-intrus' }],
      ['post', `/Admin/users/${aliceId}/reset-password`, { temporaryPassword: 'pris-par-mallory' }],
      ['post', `/Admin/users/${adminId}/reset-password`, { temporaryPassword: 'pris-par-mallory' }],
      ['put', '/Admin/google/config', { clientId: 'x', clientSecret: 'y', apiKey: 'z' }],
      ['delete', `/Admin/users/${aliceId}`],
    ];
    for (const [method, path, body] of writes) {
      expect([path, (await mallory.send(method, path, body)).status]).toEqual([path, 404]);
    }

    // Rien n'a été fait : Alice existe toujours, aucun compte créé.
    const users = (await admin.get('/admin/users')).body as {
      items: { username: string }[];
    };
    expect(users.items.map((u) => u.username).sort()).toEqual(
      expect.arrayContaining(['alice', 'mallory']),
    );
    expect(users.items.some((u) => u.username === 'intrus')).toBe(false);
  });

  it('l’admin atteint l’espace admin par son adresse exacte seulement', async () => {
    expect((await admin.get('/admin/users')).status).toBe(200);
    expect((await admin.get('/Admin/users')).status).toBe(404);
  });

  it('sans session → 401', async () => {
    expect((await new TestClient(app).get('/admin/users')).status).toBe(401);
  });
});
