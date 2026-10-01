import { randomInt } from 'node:crypto';
import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { DEFAULT_THEME_CONFIG, type GroupDetail } from '@strategos/shared';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { hashPassword } from '../src/auth/password.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { configureApp } from '../src/setup.js';

export const ORIGIN = 'http://localhost:5173';
/** Mot de passe de l'admin une fois le changement forcé fait (voir `adminClient`). */
export const ADMIN_PASSWORD = 'mot-de-passe-admin';
/** Pseudo choisi par l'admin au premier changement d'identifiants (obligatoire). */
export const ADMIN_USERNAME = 'administrateur';

export async function createTestApp(controllers: Type[] = []): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule], controllers }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app);
  await app.init();
  return app;
}

/** Base vide, sauf le compte `admin` / `admin` des données initiales. */
export async function resetDatabase(app: NestExpressApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  await prisma.$executeRawUnsafe(
    'TRUNCATE users, sessions, login_attempts, audit_log, pages, media, settings, groups, discussion_spaces, sources, forms, submissions, backups, google_credentials, onedrive_credentials CASCADE',
  );
  // Thèmes : seul « Sobre », le thème de l'installation, est gardé, dans son état initial.
  await prisma.$executeRawUnsafe(`DELETE FROM themes WHERE name <> 'Sobre'`);
  await prisma.theme.update({
    where: { name: 'Sobre' },
    data: { config: DEFAULT_THEME_CONFIG as unknown as Prisma.InputJsonValue, version: 1 },
  });
  // Données initiales de la migration des pages : réglages, header et footer vides.
  await prisma.$executeRawUnsafe(
    `INSERT INTO settings (id, default_theme_id) SELECT 1, id FROM themes WHERE name = 'Sobre'`,
  );
  await prisma.layoutPart.updateMany({
    data: {
      draftConfig: { rows: [] },
      publishedConfig: Prisma.DbNull,
      publishedAt: null,
      version: 1,
    },
  });
  await prisma.user.create({
    data: {
      username: 'admin',
      passwordHash: await hashPassword('admin'),
      isAdmin: true,
      mustChangeCredentials: true,
    },
  });
}

type Method = 'post' | 'put' | 'patch' | 'delete';

/**
 * Navigateur simulé : garde ses cookies, envoie `Origin` et `X-CSRF-Token`, et
 * vient d'une IP propre (via `X-Forwarded-For`) pour ne pas partager les blocages.
 */
export class TestClient {
  readonly agent: ReturnType<typeof request.agent>;
  private csrfToken?: string;

  constructor(
    app: NestExpressApplication,
    readonly ip = `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`,
  ) {
    this.agent = request.agent(app.getHttpServer());
  }

  get(path: string) {
    return this.agent.get(`/api/v1${path}`).set('X-Forwarded-For', this.ip);
  }

  /** Requête qui modifie des données, avec en-têtes CSRF valides. */
  async send(method: Method, path: string, body?: object) {
    this.csrfToken ??= (await this.get('/auth/csrf').expect(200)).body.csrfToken as string;
    const req = this.agent[method](`/api/v1${path}`)
      .set('X-Forwarded-For', this.ip)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', this.csrfToken);
    return body ? req.send(body) : req;
  }

  /** Envoi `multipart/form-data` d'un fichier (champ `file`), avec en-têtes CSRF. */
  async upload(path: string, file: Buffer, filename: string, fields: Record<string, string> = {}) {
    this.csrfToken ??= (await this.get('/auth/csrf').expect(200)).body.csrfToken as string;
    let req = this.agent
      .post(`/api/v1${path}`)
      .set('X-Forwarded-For', this.ip)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', this.csrfToken)
      .attach('file', file, filename);
    for (const [key, value] of Object.entries(fields)) req = req.field(key, value);
    return req;
  }

  /** Connexion ; le jeton CSRF change avec la session. */
  async login(username: string, password: string) {
    const res = await this.send('post', '/auth/login', { username, password });
    this.csrfToken = undefined;
    return res;
  }

  forgetCsrf(): void {
    this.csrfToken = undefined;
  }
}

/** Admin connecté, identifiants initiaux déjà changés. */
export async function adminClient(app: NestExpressApplication): Promise<TestClient> {
  const client = new TestClient(app);
  const prisma = app.get(PrismaService);
  const admin = await prisma.user.findFirstOrThrow({ where: { isAdmin: true } });
  if (admin.mustChangeCredentials) {
    await client.login('admin', 'admin').then((r) => expectStatus(r, 200));
    await client
      .send('post', '/auth/change-credentials', {
        currentPassword: 'admin',
        newPassword: ADMIN_PASSWORD,
        newUsername: ADMIN_USERNAME,
      })
      .then((r) => expectStatus(r, 200));
  } else {
    await client.login(admin.username, ADMIN_PASSWORD).then((r) => expectStatus(r, 200));
  }
  return client;
}

/** Crée un compte par l'admin et renvoie son id. */
export async function createUser(
  admin: TestClient,
  username: string,
  temporaryPassword = 'mot-de-passe-temporaire',
): Promise<string> {
  const res = await admin.send('post', '/admin/users', { username, temporaryPassword });
  expectStatus(res, 201);
  return res.body.id as string;
}

export function expectStatus(res: { status: number; body: unknown }, status: number): void {
  if (res.status !== status) {
    throw new Error(`Statut ${res.status} au lieu de ${status} : ${JSON.stringify(res.body)}`);
  }
}

/** Image PNG de 1 × 1 pixel. */
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

let counter = 0;
/** UUID v7 de test, unique et stable dans un fichier de test. */
export function uid(): string {
  counter += 1;
  return `0190f5c0-0000-7000-8000-${counter.toString(16).padStart(12, '0')}`;
}

/** Utilisateur ordinaire connecté, identifiants déjà changés. */
export async function userClient(
  app: NestExpressApplication,
  admin: TestClient,
  username: string,
): Promise<TestClient> {
  await createUser(admin, username, 'temporaire-utilisateur');
  const client = new TestClient(app);
  expectStatus(await client.login(username, 'temporaire-utilisateur'), 200);
  expectStatus(
    await client.send('post', '/auth/change-credentials', {
      currentPassword: 'temporaire-utilisateur',
      newPassword: 'mot-de-passe-utilisateur',
    }),
    200,
  );
  return client;
}

/** Crée un groupe par l'admin, avec ses membres et la lecture de pages ; renvoie son id. */
export async function createGroup(
  admin: TestClient,
  name: string,
  { userIds = [], pageIds = [] }: { userIds?: string[]; pageIds?: string[] } = {},
): Promise<string> {
  const res = await admin.send('post', '/admin/groups', { name });
  expectStatus(res, 201);
  const id = res.body.id as string;
  if (userIds.length) {
    expectStatus(await admin.send('put', `/admin/groups/${id}/members`, { userIds }), 200);
  }
  if (pageIds.length) await grantRead(admin, id, pageIds);
  return id;
}

/** Ajoute au groupe la lecture de pages, en gardant ses autres permissions. */
export async function grantRead(admin: TestClient, groupId: string, pageIds: string[]) {
  const { permissions } = (await admin.get(`/admin/groups/${groupId}`)).body as GroupDetail;
  const body = [
    ...permissions.map(({ resourceName: _name, ...permission }) => permission),
    ...pageIds.map((resourceId) => ({
      resourceType: 'page',
      resourceId,
      canRead: true,
      canCreateTopic: false,
      canPost: false,
    })),
  ];
  expectStatus(
    await admin.send('put', `/admin/groups/${groupId}/permissions`, { permissions: body }),
    200,
  );
}

/** Id du compte connecté. */
export async function meId(client: TestClient): Promise<string> {
  return (await client.get('/auth/me')).body.id as string;
}
