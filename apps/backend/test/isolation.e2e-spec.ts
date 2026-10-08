import type { AddressInfo } from 'node:net';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type {
  AdminPage,
  AssembledPage,
  Block,
  ChatMessageView,
  Row,
  SourceSummary,
} from '@strategos/shared';
import { CHAT_WS_EVENTS } from '@strategos/shared';
import WebSocket from 'ws';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  ORIGIN,
  PNG,
  TestClient,
  adminClient,
  createGroup,
  createTestApp,
  expectStatus,
  meId,
  resetDatabase,
  uid,
  userClient,
} from './helpers.js';
import { buildXlsx } from './xlsx.js';

/** Ce que seul le groupe A doit voir : aucune de ces chaînes ne doit parvenir à Bob. */
const SECRETS = {
  page: 'Quartier-A',
  cell: 'SECRET-CELLULE-A',
  topic: 'SECRET-SUJET-A',
  message: 'SECRET-MESSAGE-A',
  chat: 'SECRET-CHAT-A',
  note: 'SECRET-NOTE-A',
  form: 'SECRET-FORMULAIRE-A',
  submission: 'SECRET-SOUMISSION-A',
};

const rowOf = (block: Block): Row => ({ id: uid(), columns: [{ width: '1/1', block }] });

type Frame = { event?: string; data?: unknown };

/** Connexion WebSocket d'un compte, avec les trames reçues. */
async function chatSocket(port: number, cookie: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/v1/ws`, {
    headers: { Cookie: cookie, Origin: ORIGIN },
  });
  const frames: Frame[] = [];
  ws.on('message', (raw) => frames.push(JSON.parse(String(raw)) as Frame));
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => setTimeout(resolve, 80));
    ws.once('error', reject);
  });
  const next = async (event: string): Promise<Frame> => {
    for (let waited = 0; waited < 3000; waited += 20) {
      const i = frames.findIndex((f) => f.event === event);
      if (i >= 0) return frames.splice(i, 1)[0]!;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`trame « ${event} » non reçue`);
  };
  const send = (event: string, data: unknown) => ws.send(JSON.stringify({ event, data }));
  return { ws, frames, next, send };
}

/**
 * Cloisonnement entre groupes (bilan de sécurité, section 2) : Alice est dans le
 * groupe A, Bob dans le groupe B. Bob vise une à une les ressources de la page de
 * A — par leur identifiant, qu'on suppose connu — et ne doit recevoir que des
 * `404`, sans qu'aucun contenu de A n'apparaisse dans ce qu'il reçoit.
 */
describe('Cloisonnement entre groupes (e2e)', () => {
  let app: NestExpressApplication;
  let port: number;
  let admin: TestClient;
  let alice: TestClient;
  let bob: TestClient;
  let aliceCookie: string;
  let bobCookie: string;
  const a = {
    pageId: '',
    tableId: '',
    formId: '',
    chatId: '',
    spaceId: '',
    topicId: '',
    messageId: '',
    attachmentId: '',
    chatMessageId: '',
    submissionId: '',
    noteId: '',
  };
  let pageB: string;

  const cookieOf = async (client: TestClient, username: string): Promise<string> => {
    const res = await client.login(username, 'mot-de-passe-utilisateur');
    expectStatus(res, 200);
    const set = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    return set.find((c) => c.startsWith('strategos_session='))!.split(';')[0]!;
  };

  async function publish(pageId: string, blocks: Block[]): Promise<void> {
    const page = (await admin.get(`/admin/pages/${pageId}`)).body as AdminPage;
    expectStatus(
      await admin.send('put', `/admin/pages/${pageId}/draft`, {
        name: page.name,
        config: {
          zones: { main: blocks.map(rowOf), sidebar: null },
          themeId: null,
          showHeader: true,
          showFooter: true,
          showSidebar: false,
        },
        version: page.version,
      }),
      200,
    );
  }

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    port = (app.getHttpServer().address() as AddressInfo).port;
    await resetDatabase(app);
    const prisma = app.get(PrismaService);
    admin = await adminClient(app);
    alice = await userClient(app, admin, 'alice');
    bob = await userClient(app, admin, 'bob');
    aliceCookie = await cookieOf(alice, 'alice');
    bobCookie = await cookieOf(bob, 'bob');

    const uploaded = await admin.upload(
      '/admin/sources/upload',
      await buildXlsx({
        Interne: { A1: 'Objet', B1: 'Quantité', A2: SECRETS.cell, B2: 3, D1: 'Or', D2: 100 },
      }),
      'quartier-a.xlsx',
    );
    expectStatus(uploaded, 201);
    const source = uploaded.body as SourceSummary;

    // Page du groupe A : tableau, formulaire, chat, espace de discussion.
    a.pageId = (
      (await admin.send('post', '/admin/pages', { name: SECRETS.page })).body as AdminPage
    ).id;
    const table: Block = {
      id: uid(),
      type: 'table',
      config: {
        sourceId: source.id,
        sheet: 'Interne',
        range: { mode: 'extensible', columns: 'A:B', startRow: 1 },
        headerRow: true,
        columns: [
          { col: 'A', visible: true, label: '', format: 'text' },
          { col: 'B', visible: true, label: '', format: 'number' },
        ],
        pageSize: 10,
        sortable: true,
        searchable: true,
      },
    };
    const chat: Block = { id: uid(), type: 'chat', config: { name: 'Salon A', height: 400 } };
    const space: Block = {
      id: uid(),
      type: 'discussion_space',
      config: { name: 'Taverne A', sortMode: 'activity' },
    };
    const formBlockId = uid();
    const form = await admin.send('post', '/admin/forms', {
      pageId: a.pageId,
      pageBlockId: formBlockId,
      mode: 'modification',
    });
    expectStatus(form, 201);
    a.formId = form.body.id as string;
    a.tableId = table.id;
    a.chatId = chat.id;
    await publish(a.pageId, [
      table,
      chat,
      space,
      { id: formBlockId, type: 'form', config: { formId: a.formId } },
    ]);
    expectStatus(
      await admin.send('put', `/admin/forms/${a.formId}/draft`, {
        version: 1,
        definition: {
          title: SECRETS.form,
          intro: '',
          successMessage: '',
          sourceId: source.id,
          sheet: 'Interne',
          fields: [
            {
              key: 'or',
              label: 'Or',
              help: '',
              type: 'text',
              required: true,
              cell: 'D2',
            },
          ],
        },
      }),
      200,
    );
    expectStatus(await admin.send('post', `/admin/pages/${a.pageId}/publish`, {}), 200);
    a.spaceId = (
      await prisma.discussionSpace.findFirstOrThrow({ where: { blockId: space.id } })
    ).id;

    // Page du groupe B : un bouton vers la page de A, qui doit disparaître pour Bob.
    pageB = ((await admin.send('post', '/admin/pages', { name: 'Quartier-B' })).body as AdminPage)
      .id;
    await publish(pageB, [
      {
        id: uid(),
        type: 'buttons',
        config: {
          orientation: 'horizontal',
          align: 'left',
          buttons: [
            { id: uid(), label: 'Chez A', target: { kind: 'page', pageId: a.pageId } },
            { id: uid(), label: 'Chez B', target: { kind: 'page', pageId: pageB } },
          ],
        },
      } as Block,
    ]);
    expectStatus(await admin.send('post', `/admin/pages/${pageB}/publish`, {}), 200);

    await createGroup(admin, 'Groupe A', { userIds: [await meId(alice)], pageIds: [a.pageId] });
    const groupA = (await prisma.group.findFirstOrThrow({ where: { name: 'Groupe A' } })).id;
    await createGroup(admin, 'Groupe B', { userIds: [await meId(bob)], pageIds: [pageB] });
    expectStatus(
      await admin.send('put', `/admin/groups/${groupA}/permissions`, {
        permissions: [
          {
            resourceType: 'page',
            resourceId: a.pageId,
            canRead: true,
            canCreateTopic: false,
            canPost: false,
          },
          {
            resourceType: 'space',
            resourceId: a.spaceId,
            canRead: true,
            canCreateTopic: true,
            canPost: true,
          },
        ],
      }),
      200,
    );

    // Contenu créé par Alice.
    const attachment = await alice.upload('/attachments', PNG, 'photo.png');
    expectStatus(attachment, 201);
    a.attachmentId = attachment.body.id as string;
    const topic = await alice.send('post', `/spaces/${a.spaceId}/topics`, {
      title: SECRETS.topic,
      firstMessage: `<p>${SECRETS.message}</p>`,
      attachmentIds: [a.attachmentId],
    });
    expectStatus(topic, 201);
    a.topicId = topic.body.id as string;
    a.messageId = (
      await prisma.topicMessage.findFirstOrThrow({ where: { topicId: a.topicId } })
    ).id;

    const socket = await chatSocket(port, aliceCookie);
    socket.send(CHAT_WS_EVENTS.join, { blockId: a.chatId });
    await socket.next(CHAT_WS_EVENTS.joined);
    socket.send(CHAT_WS_EVENTS.send, { blockId: a.chatId, clientId: 'a-1', content: SECRETS.chat });
    a.chatMessageId = (
      (await socket.next(CHAT_WS_EVENTS.ack)).data as { message: ChatMessageView }
    ).message.id;
    socket.ws.close();

    const submission = await alice.send('post', `/forms/${a.formId}/submissions`, {
      values: { or: SECRETS.submission },
    });
    expectStatus(submission, 201);
    a.submissionId = submission.body.id as string;
    const note = await alice.send('post', '/me/notes', {
      title: SECRETS.note,
      content: `<p>${SECRETS.note}</p>`,
    });
    expectStatus(note, 201);
    a.noteId = note.body.id as string;
  });

  afterAll(async () => {
    await app.close();
  });

  const reads = (): string[] => [
    `/pages/${a.pageId}`,
    `/blocks/${a.tableId}/rows`,
    `/forms/${a.formId}`,
    `/spaces/${a.spaceId}/topics`,
    `/topics/${a.topicId}`,
    `/attachments/${a.attachmentId}`,
    `/chats/${a.chatId}/messages`,
    `/me/submissions/${a.submissionId}`,
  ];

  it('témoin : Alice lit chaque ressource de sa page', async () => {
    for (const path of reads()) {
      expect([path, (await alice.get(path)).status]).toEqual([path, 200]);
    }
    const page = JSON.stringify((await alice.get(`/pages/${a.pageId}`)).body);
    expect(page).toContain(a.formId);
    const rows = JSON.stringify((await alice.get(`/blocks/${a.tableId}/rows`)).body);
    expect(rows).toContain(SECRETS.cell);
  });

  it('Bob lit sa page, sans le lien vers celle de A', async () => {
    const res = await bob.get(`/pages/${pageB}`);
    expectStatus(res, 200);
    const page = res.body as AssembledPage;
    const labels = (page.zones.main ?? [])
      .flatMap((r) => r.columns.map((c) => c.block))
      .flatMap((b) => (b?.type === 'buttons' ? b.config.buttons.map((x) => x.label) : []));
    expect(labels).toEqual(['Chez B']);
    expect(JSON.stringify(page)).not.toContain(a.pageId);
  });

  it('lectures de Bob sur les ressources de A → 404', async () => {
    for (const path of reads()) {
      const res = await bob.get(path);
      expect([path, res.status]).toEqual([path, 404]);
      expect(res.body.code).toBe('NOT_FOUND');
    }
    expect((await bob.get(`/forms/${a.formId}/prefill?rowKey=1`)).status).toBe(404);
  });

  it('écritures de Bob sur les ressources de A → 404, rien n’est modifié', async () => {
    const prisma = app.get(PrismaService);
    const count = async () => ({
      topics: await prisma.topic.count(),
      messages: await prisma.topicMessage.count(),
      submissions: await prisma.submission.count(),
      revisions: await prisma.messageRevision.count(),
      notes: await prisma.userNote.count(),
    });
    const before = await count();
    const html = '<p>intrus</p>';
    const writes: ['post' | 'put' | 'patch' | 'delete', string, object?][] = [
      ['post', `/spaces/${a.spaceId}/topics`, { title: 'Intrus', firstMessage: html }],
      ['patch', `/topics/${a.topicId}`, { title: 'Renommé par Bob' }],
      ['post', `/topics/${a.topicId}/messages`, { content: html }],
      ['put', `/messages/${a.messageId}`, { content: html }],
      ['delete', `/messages/${a.messageId}`],
      ['put', `/chat-messages/${a.chatMessageId}`, { content: 'intrus' }],
      ['delete', `/chat-messages/${a.chatMessageId}`],
      ['post', `/forms/${a.formId}/submissions`, { values: { or: 'intrus' } }],
      ['put', `/me/notes/${a.noteId}`, { title: 'Intrus', content: html }],
      ['delete', `/me/notes/${a.noteId}`],
    ];
    for (const [method, path, body] of writes) {
      const res = await bob.send(method, path, body);
      expect([method, path, res.status]).toEqual([method, path, 404]);
    }
    expect(await count()).toEqual(before);
    // Une image de A ne se joint pas à un message de Bob… qui n'a d'ailleurs aucun espace.
    expect((await bob.upload('/attachments', PNG, 'x.png')).status).toBe(403);
    const message = await prisma.topicMessage.findUniqueOrThrow({ where: { id: a.messageId } });
    expect(message.deletedAt).toBeNull();
    expect(message.content).toContain(SECRETS.message);
  });

  it('listes de Bob : rien de A dans ses soumissions, ses notes, son profil et le layout', async () => {
    for (const path of ['/me/submissions', '/me/notes', '/me/profile', '/layout', '/auth/me']) {
      const res = await bob.get(path);
      expectStatus(res, 200);
      const json = JSON.stringify(res.body);
      for (const secret of [...Object.values(SECRETS), a.pageId, a.formId, a.spaceId]) {
        expect([path, json.includes(secret)]).toEqual([path, false]);
      }
    }
  });

  it('WebSocket : Bob ne rejoint pas le salon de A, n’y écrit pas et n’en reçoit rien', async () => {
    const bobSocket = await chatSocket(port, bobCookie);
    bobSocket.send(CHAT_WS_EVENTS.join, { blockId: a.chatId });
    expect((await bobSocket.next(CHAT_WS_EVENTS.error)).data).toEqual({ code: 'NOT_FOUND' });
    bobSocket.send(CHAT_WS_EVENTS.send, { blockId: a.chatId, clientId: 'b-1', content: 'intrus' });
    expect((await bobSocket.next(CHAT_WS_EVENTS.error)).data).toEqual({
      clientId: 'b-1',
      code: 'NOT_FOUND',
    });

    const aliceSocket = await chatSocket(port, aliceCookie);
    aliceSocket.send(CHAT_WS_EVENTS.join, { blockId: a.chatId });
    await aliceSocket.next(CHAT_WS_EVENTS.joined);
    aliceSocket.send(CHAT_WS_EVENTS.send, {
      blockId: a.chatId,
      clientId: 'a-2',
      content: `${SECRETS.chat} bis`,
    });
    await aliceSocket.next(CHAT_WS_EVENTS.ack);
    await new Promise((r) => setTimeout(r, 200));
    expect(bobSocket.frames).toEqual([]);

    const history = (await alice.get(`/chats/${a.chatId}/messages`)).body as {
      items: ChatMessageView[];
    };
    expect(JSON.stringify(history)).not.toContain('intrus');
    bobSocket.ws.close();
    aliceSocket.ws.close();
  });
});
