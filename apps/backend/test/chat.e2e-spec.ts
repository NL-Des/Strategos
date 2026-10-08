import type { AddressInfo } from 'node:net';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { AdminPage, ChatMessageView, PageConfig, Row } from '@strategos/shared';
import { CHAT_WS_EVENTS, MESSAGE_MAX_LENGTH } from '@strategos/shared';
import type { Response } from 'supertest';
import WebSocket from 'ws';
import { ChatGateway } from '../src/chat/chat.gateway.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  adminClient,
  createGroup,
  createUser,
  createTestApp,
  expectStatus,
  ORIGIN,
  resetDatabase,
  TestClient,
  uid,
} from './helpers.js';

const chatRow = (name = 'Salon'): Row => ({
  id: uid(),
  columns: [{ width: '1/1', block: { id: uid(), type: 'chat', config: { name, height: 400 } } }],
});

const config = (main: Row[]): PageConfig => ({
  zones: { main, sidebar: null },
  themeId: null,
  showHeader: true,
  showFooter: true,
  showSidebar: false,
});

/** Cookie de session (`strategos_session=…`) extrait d'une réponse de connexion. */
function sessionCookie(res: Response): string {
  const set = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const cookie = set.find((c) => c.startsWith('strategos_session='));
  if (!cookie) throw new Error('aucun cookie de session');
  return cookie.split(';')[0]!;
}

/** Membre connecté : client REST, son id, et le cookie de sa session (pour le WebSocket). */
async function member(
  app: NestExpressApplication,
  admin: TestClient,
  username: string,
): Promise<{ client: TestClient; id: string; cookie: string }> {
  const id = await createUser(admin, username, 'temporaire-membre');
  const client = new TestClient(app);
  expectStatus(await client.login(username, 'temporaire-membre'), 200);
  expectStatus(
    await client.send('post', '/auth/change-credentials', {
      currentPassword: 'temporaire-membre',
      newPassword: 'mot-de-passe-membre',
    }),
    200,
  );
  const loginRes = await client.login(username, 'mot-de-passe-membre');
  return { client, id, cookie: sessionCookie(loginRes) };
}

/** Connexion WebSocket de test, avec collecte des trames reçues. */
class WsClient {
  readonly ws: WebSocket;
  private readonly buffer: { event?: string; data?: unknown }[] = [];
  private readonly waiters: {
    pred: (f: { event?: string }) => boolean;
    resolve: (f: { event?: string; data?: unknown }) => void;
  }[] = [];

  constructor(port: number, cookie: string, origin = ORIGIN) {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/api/v1/ws`, {
      headers: { Cookie: cookie, Origin: origin },
    });
    this.ws.on('message', (raw) => {
      const frame = JSON.parse(String(raw)) as { event?: string; data?: unknown };
      const i = this.waiters.findIndex((w) => w.pred(frame));
      if (i >= 0) this.waiters.splice(i, 1)[0]!.resolve(frame);
      else this.buffer.push(frame);
    });
  }

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws.once('open', () => setTimeout(resolve, 80));
      this.ws.once('close', () => reject(new Error('fermé avant ouverture')));
      this.ws.once('error', (err) => reject(err));
      this.ws.once('unexpected-response', (_req, res) =>
        reject(new Error(`handshake HTTP ${res.statusCode}`)),
      );
    });
  }

  next(
    pred: (f: { event?: string }) => boolean = () => true,
    ms = 3000,
  ): Promise<{ event?: string; data?: unknown }> {
    const i = this.buffer.findIndex(pred);
    if (i >= 0) return Promise.resolve(this.buffer.splice(i, 1)[0]!);
    return new Promise((resolve, reject) => {
      const waiter = { pred, resolve };
      this.waiters.push(waiter);
      setTimeout(() => {
        const j = this.waiters.indexOf(waiter);
        if (j >= 0) {
          this.waiters.splice(j, 1);
          reject(new Error('trame attendue non reçue'));
        }
      }, ms);
    });
  }

  send(event: string, data: unknown): void {
    this.ws.send(JSON.stringify({ event, data }));
  }

  closed(): Promise<number> {
    return new Promise((resolve) => this.ws.once('close', (code) => resolve(code)));
  }

  close(): void {
    this.ws.close();
  }
}

describe('Chat temps réel (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: TestClient;
  let port: number;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await app.listen(0);
    port = (app.getHttpServer().address() as AddressInfo).port;
  });

  beforeEach(async () => {
    await resetDatabase(app);
    admin = await adminClient(app);
  });

  afterAll(async () => {
    await app.close();
  });

  /** Crée une page avec un chat, la publie, et renvoie la page et le blockId du salon. */
  async function pageWithChat(): Promise<{ page: AdminPage; blockId: string }> {
    const created = await admin.send('post', '/admin/pages', { name: 'Salon' });
    expectStatus(created, 201);
    const page = created.body as AdminPage;
    const row = chatRow();
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
    return { page: (await admin.get(`/admin/pages/${page.id}`)).body as AdminPage, blockId };
  }

  it('crée le chat à la publication de la page, pas avant', async () => {
    const created = await admin.send('post', '/admin/pages', { name: 'Salon' });
    const page = created.body as AdminPage;
    await admin.send('put', `/admin/pages/${page.id}/draft`, {
      name: page.name,
      config: config([chatRow()]),
      version: page.version,
    });
    expect(await prisma.chat.count()).toBe(0);
    const preview = (await admin.get(`/admin/pages/${page.id}/publish/preview`)).body;
    expect(preview.chats).toEqual([{ name: 'Salon', change: 'created' }]);

    expectStatus(await admin.send('post', `/admin/pages/${page.id}/publish`), 200);
    expect(await prisma.chat.count({ where: { deletedAt: null } })).toBe(1);
  });

  it('retire le bloc → chat en suppression douce', async () => {
    const { page, blockId } = await pageWithChat();
    expectStatus(
      await admin.send('put', `/admin/pages/${page.id}/draft`, {
        name: page.name,
        config: config([]),
        version: page.version,
      }),
      200,
    );
    expectStatus(await admin.send('post', `/admin/pages/${page.id}/publish`), 200);
    const chat = await prisma.chat.findUniqueOrThrow({ where: { blockId } });
    expect(chat.deletedAt).not.toBeNull();
  });

  it('refuse le handshake sans cookie ou avec une Origin étrangère', async () => {
    const { cookie } = await member(app, admin, 'alice');
    // Le serveur accepte l'upgrade puis ferme aussitôt : la connexion se ferme
    // sans qu'aucune trame applicative ne soit échangée.
    const noCookie = new WsClient(port, '');
    await expect(noCookie.closed()).resolves.toBeGreaterThanOrEqual(1000);
    const badOrigin = new WsClient(port, cookie, 'https://mechant.example');
    await expect(badOrigin.closed()).resolves.toBeGreaterThanOrEqual(1000);
  });

  it('refuse le handshake avant le changement d’identifiants imposé', async () => {
    await createUser(admin, 'novice', 'temporaire-novice');
    const client = new TestClient(app);
    const res = await client.login('novice', 'temporaire-novice');
    expectStatus(res, 200);
    const ws = new WsClient(port, sessionCookie(res));
    await expect(ws.closed()).resolves.toBeGreaterThanOrEqual(1000);
  });

  it('chat.join sans lecture de la page → chat.error NOT_FOUND', async () => {
    const { blockId } = await pageWithChat();
    // Carol n'a aucun groupe : elle ne peut pas lire la page.
    const carol = await member(app, admin, 'carol');
    const ws = new WsClient(port, carol.cookie);
    await ws.open();
    ws.send(CHAT_WS_EVENTS.join, { blockId });
    const frame = await ws.next((f) => f.event === CHAT_WS_EVENTS.error);
    expect((frame.data as { code: string }).code).toBe('NOT_FOUND');
    ws.close();
  });

  it('chat.send : accusé au même clientId, création diffusée aux autres', async () => {
    const { page, blockId } = await pageWithChat();
    const alice = await member(app, admin, 'alice');
    const bob = await member(app, admin, 'bob');
    await createGroup(admin, 'lecteurs', {
      userIds: [alice.id, bob.id],
      pageIds: [page.id],
    });

    const wa = new WsClient(port, alice.cookie);
    const wb = new WsClient(port, bob.cookie);
    await Promise.all([wa.open(), wb.open()]);
    wa.send(CHAT_WS_EVENTS.join, { blockId });
    wb.send(CHAT_WS_EVENTS.join, { blockId });
    await wa.next((f) => f.event === CHAT_WS_EVENTS.joined);
    await wb.next((f) => f.event === CHAT_WS_EVENTS.joined);

    wa.send(CHAT_WS_EVENTS.send, { blockId, clientId: 'c-1', content: 'Bonjour' });
    const ack = await wa.next((f) => f.event === CHAT_WS_EVENTS.ack);
    const ackData = ack.data as { clientId: string; message: ChatMessageView };
    expect(ackData.clientId).toBe('c-1');
    expect(ackData.message.content).toContain('Bonjour');
    expect(ackData.message.mine).toBe(true);

    const created = await wb.next((f) => f.event === 'chat.message.created');
    const createdData = created.data as { message: ChatMessageView };
    expect(createdData.message.id).toBe(ackData.message.id);
    expect(createdData.message.mine).toBe(false);
    wa.close();
    wb.close();
  });

  it('modification, suppression et masquage : archivés et diffusés', async () => {
    const { page, blockId } = await pageWithChat();
    const alice = await member(app, admin, 'alice');
    const bob = await member(app, admin, 'bob');
    await createGroup(admin, 'lecteurs', { userIds: [alice.id, bob.id], pageIds: [page.id] });

    const wb = new WsClient(port, bob.cookie);
    await wb.open();
    wb.send(CHAT_WS_EVENTS.join, { blockId });
    await wb.next((f) => f.event === CHAT_WS_EVENTS.joined);

    // Alice envoie via WebSocket ; on récupère l'id par l'accusé.
    const wa = new WsClient(port, alice.cookie);
    await wa.open();
    wa.send(CHAT_WS_EVENTS.join, { blockId });
    await wa.next((f) => f.event === CHAT_WS_EVENTS.joined);
    wa.send(CHAT_WS_EVENTS.send, { blockId, clientId: 'c-1', content: 'Salut' });
    const ack = await wa.next((f) => f.event === CHAT_WS_EVENTS.ack);
    const messageId = (ack.data as { message: ChatMessageView }).message.id;
    await wb.next((f) => f.event === 'chat.message.created');

    // Modification (auteur) → revision `edit` + diffusion `updated`.
    expectStatus(
      await alice.client.send('put', `/chat-messages/${messageId}`, { content: 'Corrigé' }),
      200,
    );
    const updated = await wb.next((f) => f.event === 'chat.message.updated');
    expect((updated.data as { message: ChatMessageView }).message.content).toContain('Corrigé');
    expect(await prisma.messageRevision.count({ where: { chatMessageId: messageId } })).toBe(1);

    // Masquage (admin) → revision `hide`, journal, diffusion `hidden`.
    expectStatus(await admin.send('post', `/admin/chat-messages/${messageId}/hide`), 204);
    const hidden = await wb.next((f) => f.event === 'chat.message.hidden');
    expect((hidden.data as { message: { id: string } }).message.id).toBe(messageId);
    expect(await prisma.auditLog.count({ where: { action: 'message.hide' } })).toBe(1);
    expect(
      await prisma.messageRevision.count({ where: { chatMessageId: messageId, action: 'hide' } }),
    ).toBe(1);

    // Suppression (auteur) → revision `delete`, message exclu, diffusion `deleted`.
    expectStatus(await alice.client.send('delete', `/chat-messages/${messageId}`), 204);
    const deleted = await wb.next((f) => f.event === 'chat.message.deleted');
    expect((deleted.data as { message: { id: string } }).message.id).toBe(messageId);
    const message = await prisma.chatMessage.findUniqueOrThrow({ where: { id: messageId } });
    expect(message.deletedAt).not.toBeNull();
    wa.close();
    wb.close();
  });

  it('modifier le message d’un autre → 403 NOT_AUTHOR', async () => {
    const { page, blockId } = await pageWithChat();
    const alice = await member(app, admin, 'alice');
    const bob = await member(app, admin, 'bob');
    await createGroup(admin, 'lecteurs', { userIds: [alice.id, bob.id], pageIds: [page.id] });

    const wa = new WsClient(port, alice.cookie);
    await wa.open();
    wa.send(CHAT_WS_EVENTS.join, { blockId });
    await wa.next((f) => f.event === CHAT_WS_EVENTS.joined);
    wa.send(CHAT_WS_EVENTS.send, { blockId, clientId: 'c-1', content: 'à moi' });
    const ack = await wa.next((f) => f.event === CHAT_WS_EVENTS.ack);
    const messageId = (ack.data as { message: ChatMessageView }).message.id;

    const editRes = await bob.client.send('put', `/chat-messages/${messageId}`, { content: 'hop' });
    expectStatus(editRes, 403);
    expect(editRes.body.code).toBe('NOT_AUTHOR');
    wa.close();
  });

  it('l’admin modifie ou supprime le message d’un autre : tracé au journal', async () => {
    const { page, blockId } = await pageWithChat();
    const alice = await member(app, admin, 'alice');
    await createGroup(admin, 'lecteurs', { userIds: [alice.id], pageIds: [page.id] });

    const wa = new WsClient(port, alice.cookie);
    await wa.open();
    wa.send(CHAT_WS_EVENTS.join, { blockId });
    await wa.next((f) => f.event === CHAT_WS_EVENTS.joined);
    wa.send(CHAT_WS_EVENTS.send, { blockId, clientId: 'c-1', content: 'à moi' });
    const ack = await wa.next((f) => f.event === CHAT_WS_EVENTS.ack);
    const messageId = (ack.data as { message: ChatMessageView }).message.id;

    expectStatus(
      await alice.client.send('put', `/chat-messages/${messageId}`, { content: 'moi' }),
      200,
    );
    expect(await prisma.auditLog.count({ where: { targetId: messageId } })).toBe(0);

    expectStatus(
      await admin.send('put', `/chat-messages/${messageId}`, { content: 'modéré' }),
      200,
    );
    expectStatus(await admin.send('delete', `/chat-messages/${messageId}`), 204);
    const actions = await prisma.auditLog.findMany({
      where: { targetId: messageId },
      orderBy: { createdAt: 'asc' },
    });
    expect(actions.map((a) => a.action)).toEqual(['message.admin_edit', 'message.admin_delete']);
    wa.close();
  });

  it('compte désactivé → connexion WebSocket fermée', async () => {
    const { page, blockId } = await pageWithChat();
    const alice = await member(app, admin, 'alice');
    await createGroup(admin, 'lecteurs', { userIds: [alice.id], pageIds: [page.id] });

    const wa = new WsClient(port, alice.cookie);
    await wa.open();
    wa.send(CHAT_WS_EVENTS.join, { blockId });
    await wa.next((f) => f.event === CHAT_WS_EVENTS.joined);

    // L'admin désactive Alice (ses sessions sont révoquées) ; au message suivant,
    // la revalidation de session ferme la connexion.
    expectStatus(await admin.send('post', `/admin/users/${alice.id}/disable`), 200);
    const closed = wa.closed();
    wa.send(CHAT_WS_EVENTS.send, { blockId, clientId: 'c-1', content: 'encore là ?' });
    await expect(closed).resolves.toBeGreaterThanOrEqual(1000);
  });

  it('droit retiré après l’entrée → le socket sort du salon à la revalidation', async () => {
    const { page, blockId } = await pageWithChat();
    const alice = await member(app, admin, 'alice');
    const bob = await member(app, admin, 'bob');
    const group = await createGroup(admin, 'lecteurs', {
      userIds: [alice.id, bob.id],
      pageIds: [page.id],
    });
    const wa = new WsClient(port, alice.cookie);
    const wb = new WsClient(port, bob.cookie);
    await Promise.all([wa.open(), wb.open()]);
    for (const ws of [wa, wb]) {
      ws.send(CHAT_WS_EVENTS.join, { blockId });
      await ws.next((f) => f.event === CHAT_WS_EVENTS.joined);
    }

    // Bob quitte le groupe : sa connexion reste ouverte, mais plus dans le salon.
    expectStatus(
      await admin.send('put', `/admin/groups/${group}/members`, { userIds: [alice.id] }),
      200,
    );
    await (app.get(ChatGateway) as unknown as { revalidateAll(): Promise<void> }).revalidateAll();

    wa.send(CHAT_WS_EVENTS.send, { blockId, clientId: 'a-1', content: 'entre nous' });
    await wa.next((f) => f.event === CHAT_WS_EVENTS.ack);
    await expect(wb.next((f) => f.event === 'chat.message.created', 300)).rejects.toThrow();
    wa.close();
    wb.close();
  });

  describe('plafonds de la passerelle', () => {
    async function joined() {
      const { page, blockId } = await pageWithChat();
      const alice = await member(app, admin, 'alice');
      await createGroup(admin, 'lecteurs', { userIds: [alice.id], pageIds: [page.id] });
      const ws = new WsClient(port, alice.cookie);
      await ws.open();
      ws.send(CHAT_WS_EVENTS.join, { blockId });
      await ws.next((f) => f.event === CHAT_WS_EVENTS.joined);
      return { alice, blockId, ws };
    }

    it('trame plus grande que le plafond → connexion fermée (1009)', async () => {
      const { blockId, ws } = await joined();
      const closed = ws.closed();
      ws.send(CHAT_WS_EVENTS.send, { blockId, clientId: 'c-1', content: 'x'.repeat(80 * 1024) });
      await expect(closed).resolves.toBe(1009);
    });

    it('message de la longueur maximale → accepté', async () => {
      const { blockId, ws } = await joined();
      ws.send(CHAT_WS_EVENTS.send, {
        blockId,
        clientId: 'c-1',
        content: 'é'.repeat(MESSAGE_MAX_LENGTH),
      });
      await ws.next((f) => f.event === CHAT_WS_EVENTS.ack);
      ws.close();
    });

    it('trame sans données → erreur, la connexion reste ouverte', async () => {
      const { blockId, ws } = await joined();
      ws.ws.send(JSON.stringify({ event: CHAT_WS_EVENTS.join }));
      const error = await ws.next((f) => f.event === CHAT_WS_EVENTS.error);
      expect(error.data).toEqual({ code: 'VALIDATION_FAILED' });
      ws.ws.send(JSON.stringify({ event: CHAT_WS_EVENTS.leave }));
      ws.send(CHAT_WS_EVENTS.send, { blockId, clientId: 'c-1', content: 'toujours là' });
      await ws.next((f) => f.event === CHAT_WS_EVENTS.ack);
      ws.close();
    });

    it('trop de trames en dix secondes → connexion fermée (1008)', async () => {
      const { ws } = await joined();
      const closed = ws.closed();
      for (let i = 0; i < 25; i++) ws.send(CHAT_WS_EVENTS.leave, { blockId: 'inconnu' });
      await expect(closed).resolves.toBe(1008);
    });

    it('onzième connexion du même compte → refusée (1013)', async () => {
      const { alice, ws } = await joined();
      const others: WsClient[] = [];
      for (let i = 0; i < 9; i++) {
        const other = new WsClient(port, alice.cookie);
        await other.open();
        others.push(other);
      }
      const extra = new WsClient(port, alice.cookie);
      await expect(extra.closed()).resolves.toBe(1013);
      // Une connexion fermée libère sa place.
      const freed = ws.closed();
      ws.close();
      await freed;
      await new Promise((r) => setTimeout(r, 100));
      const again = new WsClient(port, alice.cookie);
      await again.open();
      for (const socket of [...others, again]) socket.close();
    });
  });

  it('reconnexion : ?after= rattrape les messages manqués', async () => {
    const { page, blockId } = await pageWithChat();
    const alice = await member(app, admin, 'alice');
    await createGroup(admin, 'lecteurs', { userIds: [alice.id], pageIds: [page.id] });
    const messagesUrl = `/chats/${blockId}/messages`;

    // Deux messages envoyés par l'admin (qui lit tout) via le WebSocket.
    const wAdmin = new WsClient(port, sessionCookie(await freshAdminLogin(app)));
    await wAdmin.open();
    wAdmin.send(CHAT_WS_EVENTS.join, { blockId });
    await wAdmin.next((f) => f.event === CHAT_WS_EVENTS.joined);
    wAdmin.send(CHAT_WS_EVENTS.send, { blockId, clientId: 'a-1', content: 'msg1' });
    const first = (await wAdmin.next((f) => f.event === CHAT_WS_EVENTS.ack)).data as {
      message: ChatMessageView;
    };
    wAdmin.send(CHAT_WS_EVENTS.send, { blockId, clientId: 'a-2', content: 'msg2' });
    await wAdmin.next((f) => f.event === CHAT_WS_EVENTS.ack);

    // Alice rattrape ce qui suit msg1 : elle ne reçoit que msg2.
    const after = (await alice.client.get(`${messagesUrl}?after=${first.message.id}`))
      .body as ChatMessageView[];
    expect(after).toHaveLength(1);
    expect(after[0]!.content).toContain('msg2');
    wAdmin.close();
  });
});

/** Nouvelle connexion admin (identifiants déjà changés) pour capter un cookie de session. */
async function freshAdminLogin(app: NestExpressApplication): Promise<Response> {
  const client = new TestClient(app);
  return client.login(ADMIN_USERNAME, ADMIN_PASSWORD);
}
