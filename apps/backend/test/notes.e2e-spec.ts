import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Note } from '@strategos/shared';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  TestClient,
  adminClient,
  createTestApp,
  expectStatus,
  meId,
  resetDatabase,
  userClient,
} from './helpers.js';

describe('Notes personnelles (e2e)', () => {
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

  async function createNote(client: TestClient, title: string, content = '<p>Texte</p>') {
    const res = await client.send('post', '/me/notes', { title, content });
    expectStatus(res, 201);
    return res.body as Note;
  }

  it('création, liste (plus récente d’abord), modification et suppression douce', async () => {
    const first = await createNote(kira, 'Stratégie');
    const second = await createNote(kira, 'Butin');
    expect((await kira.get('/me/notes')).body.map((n: Note) => n.title)).toEqual([
      'Butin',
      'Stratégie',
    ]);

    const updated = await kira.send('put', `/me/notes/${first.id}`, {
      title: 'Stratégie du raid',
      content: '<p><strong>Tank</strong> devant</p>',
    });
    expectStatus(updated, 200);
    expect(updated.body).toMatchObject({
      title: 'Stratégie du raid',
      content: '<p><strong>Tank</strong> devant</p>',
    });
    expect((await kira.get('/me/notes')).body[0].id).toBe(first.id);

    expectStatus(await kira.send('delete', `/me/notes/${second.id}`), 204);
    expect((await kira.get('/me/notes')).body.map((n: Note) => n.id)).toEqual([first.id]);
    const row = await prisma.userNote.findUniqueOrThrow({ where: { id: second.id } });
    expect(row.deletedAt).not.toBeNull();
    expect((await kira.send('delete', `/me/notes/${second.id}`)).status).toBe(404);
  });

  it('HTML nettoyé : gras, italique, listes et liens gardés ; images, titres et scripts retirés', async () => {
    const note = await createNote(
      kira,
      'Brut',
      '<h2>Titre</h2><p onclick="x()"><em>ok</em> <a href="javascript:alert(1)">a</a> ' +
        '<a href="https://ex.org" target="_blank">lien</a></p><ul><li>un</li></ul>' +
        '<img src="/api/v1/media/0190f5c0-0000-7000-8000-000000000001"><script>alert(1)</script>',
    );
    expect(note.content).toBe(
      'Titre<p><em>ok</em> <a>a</a> ' +
        '<a href="https://ex.org" target="_blank" rel="noopener noreferrer">lien</a></p>' +
        '<ul><li>un</li></ul>',
    );
    const invalid = await kira.send('post', '/me/notes', { title: ' ', content: '' });
    expect(invalid.status).toBe(400);
    expect(Object.keys(invalid.body.details.fields)).toEqual(['title']);
  });

  it('accès par propriété : la note d’un autre est introuvable', async () => {
    const note = await createNote(kira, 'Secret');
    const bob = await userClient(app, admin, 'bob');
    expect((await bob.get('/me/notes')).body).toEqual([]);
    expect(
      (await bob.send('put', `/me/notes/${note.id}`, { title: 'Pris', content: '' })).status,
    ).toBe(404);
    expect((await bob.send('delete', `/me/notes/${note.id}`)).status).toBe(404);
    expect((await kira.get('/me/notes')).body[0]).toMatchObject({ title: 'Secret' });
  });

  it('l’admin lit les notes en GET seulement, et chaque lecture est tracée (notes.read)', async () => {
    const note = await createNote(kira, 'Stratégie');
    await createNote(kira, 'Effacée').then((n) => kira.send('delete', `/me/notes/${n.id}`));

    const read = await admin.get(`/admin/users/${kiraId}/notes`);
    expectStatus(read, 200);
    expect(read.body).toEqual([note]);
    expectStatus(await admin.get(`/admin/users/${kiraId}/notes`), 200);
    const entries = await prisma.auditLog.findMany({
      where: { action: 'notes.read', targetId: kiraId },
    });
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ targetType: 'user', after: { username: 'kira', count: 1 } });

    // Aucune route d'écriture côté admin.
    for (const method of ['post', 'put', 'delete'] as const) {
      const path =
        method === 'post'
          ? `/admin/users/${kiraId}/notes`
          : `/admin/users/${kiraId}/notes/${note.id}`;
      expect((await admin.send(method, path, { title: 'x', content: '' })).status).toBe(404);
    }
    expect(
      (await admin.get('/admin/users/0190f5c0-0000-7000-8000-00000000abcd/notes')).status,
    ).toBe(404);
  });

  it('un utilisateur ne peut pas lire les notes d’un autre par la route admin', async () => {
    await createNote(kira, 'Secret');
    const bob = await userClient(app, admin, 'bob');
    expect((await bob.get(`/admin/users/${kiraId}/notes`)).status).toBe(404);
    expect(await prisma.auditLog.count({ where: { action: 'notes.read' } })).toBe(0);
  });
});
