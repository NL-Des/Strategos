import { randomInt } from 'node:crypto';
import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { hashPassword } from '../src/auth/password.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { configureApp } from '../src/setup.js';

export const ORIGIN = 'http://localhost:5173';
/** Mot de passe de l'admin une fois le changement forcé fait (voir `adminClient`). */
export const ADMIN_PASSWORD = 'mot-de-passe-admin';

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
  await prisma.$executeRawUnsafe('TRUNCATE users, sessions, login_attempts, audit_log CASCADE');
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
