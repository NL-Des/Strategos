import type { NestExpressApplication } from '@nestjs/platform-express';
import type {
  AdminPage,
  AssembledPage,
  AssembledRow,
  LinkTarget,
  ResourceRights,
  RightsMatrix,
  Row,
  UserRights,
} from '@strategos/shared';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
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

const buttons = (...targets: [string, LinkTarget][]): Row => ({
  id: uid(),
  columns: [
    {
      width: '1/1',
      block: {
        id: uid(),
        type: 'buttons',
        config: {
          orientation: 'horizontal',
          align: 'left',
          buttons: targets.map(([label, target]) => ({ id: uid(), label, target })),
        },
      },
    },
  ],
});

const image = (mediaId: string, link: LinkTarget): Row => ({
  id: uid(),
  columns: [
    {
      width: '1/1',
      block: {
        id: uid(),
        type: 'image',
        config: { mediaId, alt: 'Blason', size: 'fit', align: 'center', link },
      },
    },
  ],
});

const labels = (rows: AssembledRow[] | null) =>
  (rows ?? [])
    .flatMap((r) => r.columns.map((c) => c.block))
    .flatMap((b) => (b?.type === 'buttons' ? b.config.buttons.map((x) => x.label) : []));

/**
 * Parcours A : « Partie commune » lit l'accueil, « Membres » lit le tournoi ;
 * la page « Officiers » n'est lisible par personne. Kira est dans les deux
 * groupes, Bob seulement dans « Partie commune », Zoé dans aucun.
 */
describe('Droits effectifs (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: TestClient;
  let kira: TestClient;
  let bob: TestClient;
  let zoe: TestClient;
  let ids: { kira: string; bob: string; zoe: string };
  let pages: { home: string; tournoi: string; officers: string };
  let groups: { common: string; members: string };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    admin = await adminClient(app);
    kira = await userClient(app, admin, 'kira');
    bob = await userClient(app, admin, 'bob');
    zoe = await userClient(app, admin, 'zoe');
    ids = { kira: await meId(kira), bob: await meId(bob), zoe: await meId(zoe) };
    pages = {
      home: await createPage('Accueil'),
      tournoi: await createPage('Tournoi'),
      officers: await createPage('Officiers'),
    };
    groups = {
      common: await createGroup(admin, 'Partie commune', {
        userIds: [ids.kira, ids.bob],
        pageIds: [pages.home],
      }),
      members: await createGroup(admin, 'Membres', {
        userIds: [ids.kira],
        pageIds: [pages.tournoi],
      }),
    };
  });

  afterAll(async () => {
    await app.close();
  });

  async function createPage(name: string, main: Row[] = []): Promise<string> {
    const created = await admin.send('post', '/admin/pages', { name });
    expectStatus(created, 201);
    const page = created.body as AdminPage;
    await setContent(page.id, main);
    return page.id;
  }

  async function setContent(id: string, main: Row[]) {
    const page = (await admin.get(`/admin/pages/${id}`)).body as AdminPage;
    expectStatus(
      await admin.send('put', `/admin/pages/${id}/draft`, {
        name: page.name,
        config: {
          zones: { main, sidebar: null },
          themeId: null,
          showHeader: true,
          showFooter: true,
        },
        version: page.version,
      }),
      200,
    );
    expectStatus(await admin.send('post', `/admin/pages/${id}/publish`), 200);
  }

  async function setPersonalPage(userId: string, personalPageId: string | null) {
    const user = (await admin.get(`/admin/users/${userId}`)).body;
    expectStatus(
      await admin.send('patch', `/admin/users/${userId}`, {
        username: user.username,
        personalPageId,
        version: user.version,
      }),
      200,
    );
  }

  describe('résolution', () => {
    it('union des groupes ; sans groupe, aucun droit ; page sans permission : admin seul', async () => {
      const read = async (client: TestClient) =>
        Promise.all(
          Object.values(pages).map(async (id) => (await client.get(`/pages/${id}`)).status),
        );
      expect(await read(kira)).toEqual([200, 200, 404]);
      expect(await read(bob)).toEqual([200, 404, 404]);
      expect(await read(zoe)).toEqual([404, 404, 404]);
      expect(await read(admin)).toEqual([200, 200, 200]);
    });

    it('page illisible → 404 NOT_FOUND, jamais 403', async () => {
      const res = await bob.get(`/pages/${pages.tournoi}`);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('un groupe supprimé n’accorde plus rien', async () => {
      await admin.send('delete', `/admin/groups/${groups.members}`);
      expect((await kira.get(`/pages/${pages.tournoi}`)).status).toBe(404);
      expect((await kira.get(`/pages/${pages.home}`)).status).toBe(200);
    });

    it('les droits indiquent les groupes qui les accordent', async () => {
      await createGroup(admin, 'Officiers', { userIds: [ids.kira], pageIds: [pages.home] });
      const rights = (await admin.get(`/admin/rights/users/${ids.kira}`)).body as UserRights;
      expect(rights.groups.map((g) => g.name)).toEqual(['Membres', 'Officiers', 'Partie commune']);
      const home = rights.resources.find((r) => r.resource.id === pages.home)!;
      expect(home.rights.read.map((g) => g.name)).toEqual(['Officiers', 'Partie commune']);
      expect(home.rights.post).toEqual([]);
    });

    it('le guard et les vues de droits donnent le même résultat', async () => {
      const matrix = (await admin.get('/admin/rights/matrix?type=page')).body as RightsMatrix;
      for (const [name, client] of Object.entries({ kira, bob, zoe })) {
        const userId = ids[name as keyof typeof ids];
        const byUser = (await admin.get(`/admin/rights/users/${userId}`)).body as UserRights;
        const row = matrix.users.items.find((u) => u.user.id === userId)!;
        for (const pageId of Object.values(pages)) {
          const guard = (await client.get(`/pages/${pageId}`)).status === 200;
          const byResource = (await admin.get(`/admin/rights/resources/page/${pageId}`))
            .body as ResourceRights;
          const views = [
            byUser.resources.some((r) => r.resource.id === pageId && r.rights.read.length > 0),
            row.cells[`page:${pageId}`]?.read ?? false,
            byResource.users.some((u) => u.user.id === userId && u.rights.read.length > 0),
          ];
          expect(views).toEqual([guard, guard, guard]);
        }
      }
    });
  });

  describe('vues d’administration', () => {
    it('par ressource : groupes déclarants et comptes, via quel groupe', async () => {
      const res = (await admin.get(`/admin/rights/resources/page/${pages.home}`))
        .body as ResourceRights;
      expect(res.resource).toEqual({ type: 'page', id: pages.home, name: 'Accueil' });
      expect(res.groups).toEqual([
        {
          group: { id: groups.common, name: 'Partie commune' },
          permission: { read: true, createTopic: false, post: false },
        },
      ]);
      expect(res.users.map((u) => [u.user.username, u.rights.read.map((g) => g.name)])).toEqual([
        ['bob', ['Partie commune']],
        ['kira', ['Partie commune']],
      ]);
      expect((await admin.get(`/admin/rights/resources/page/${uid()}`)).status).toBe(404);
    });

    it('matrice paginée, filtrable par groupe et par utilisateur', async () => {
      const all = (await admin.get('/admin/rights/matrix')).body as RightsMatrix;
      expect(all.resources.map((r) => r.name)).toEqual(['Accueil', 'Officiers', 'Tournoi']);
      expect(all.users.items.map((u) => u.user.username)).toEqual(['bob', 'kira', 'zoe']);
      expect(all.users.items[1]!.cells).toEqual({
        [`page:${pages.home}`]: { read: true, createTopic: false, post: false },
        [`page:${pages.tournoi}`]: { read: true, createTopic: false, post: false },
      });

      const members = (await admin.get(`/admin/rights/matrix?group=${groups.members}`))
        .body as RightsMatrix;
      expect(members.users.items.map((u) => u.user.username)).toEqual(['kira']);
      const search = (await admin.get('/admin/rights/matrix?user=zo')).body as RightsMatrix;
      expect(search.users.items.map((u) => u.user.username)).toEqual(['zoe']);
      const paged = (await admin.get('/admin/rights/matrix?pageSize=2&page=2'))
        .body as RightsMatrix;
      expect(paged.users).toMatchObject({ total: 3, page: 2, pageSize: 2 });
      expect(paged.users.items.map((u) => u.user.username)).toEqual(['zoe']);
    });

    it('la fiche utilisateur porte groupes, droits et page personnelle', async () => {
      await setPersonalPage(ids.kira, pages.tournoi);
      const res = await admin.get(`/admin/users/${ids.kira}`);
      expect(res.body.personalPageId).toBe(pages.tournoi);
      expect(res.body.groups.map((g: { name: string }) => g.name)).toEqual([
        'Membres',
        'Partie commune',
      ]);
      expect(res.body.rights.resources).toHaveLength(2);
    });

    it('page personnelle inconnue → 400 ; tracée au journal', async () => {
      const user = (await admin.get(`/admin/users/${ids.kira}`)).body;
      const bad = await admin.send('patch', `/admin/users/${ids.kira}`, {
        username: 'kira',
        personalPageId: uid(),
        version: user.version,
      });
      expect(bad.status).toBe(400);
      expect(bad.body.details.fields).toEqual({ personalPageId: ['notFound'] });

      await setPersonalPage(ids.kira, pages.tournoi);
      const entry = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'user.update', targetId: ids.kira },
      });
      expect(entry.before).toMatchObject({ personalPageId: null });
      expect(entry.after).toMatchObject({ personalPageId: pages.tournoi });
    });
  });

  describe('assemblage filtré', () => {
    it('liens vers une page illisible : bouton retiré, image sans lien ; « Ma page personnelle » résolu ou retiré', async () => {
      const media = await admin.upload('/admin/media', PNG, 'blason.png');
      expectStatus(media, 201);
      await setContent(pages.home, [
        buttons(
          ['Tournoi', { kind: 'page', pageId: pages.tournoi }],
          ['Site', { kind: 'url', url: 'https://example.org' }],
          ['Mon espace', { kind: 'personal_page' }],
        ),
        image(media.body.id as string, { kind: 'page', pageId: pages.tournoi }),
      ]);
      await setPersonalPage(ids.kira, pages.tournoi);
      await setPersonalPage(ids.bob, pages.officers);

      const seenBy = async (client: TestClient) =>
        (await client.get(`/pages/${pages.home}`)).body as AssembledPage;
      const kiraView = await seenBy(kira);
      expect(labels(kiraView.zones.main)).toEqual(['Tournoi', 'Site', 'Mon espace']);
      const kiraButtons = kiraView.zones.main![0]!.columns[0]!.block!;
      expect(kiraButtons.type === 'buttons' && kiraButtons.config.buttons[2]!.link).toEqual({
        kind: 'page',
        pageId: pages.tournoi,
      });

      // Bob : pas le droit de lire le tournoi, ni sa page personnelle.
      const bobView = await seenBy(bob);
      expect(labels(bobView.zones.main)).toEqual(['Site']);
      const bobImage = bobView.zones.main![1]!.columns[0]!.block!;
      expect(bobImage.type === 'image' && bobImage.config.link).toBeNull();
      expect(JSON.stringify(bobView)).not.toContain(pages.tournoi);
    });

    it('page d’arrivée illisible → 404 (écran « Aucun espace »)', async () => {
      const settings = (await admin.get('/admin/settings')).body;
      expectStatus(
        await admin.send('put', '/admin/settings', { ...settings, landingPageId: pages.home }),
        200,
      );
      expect((await zoe.get('/auth/me')).body.landingPageId).toBe(pages.home);
      expect((await zoe.get(`/pages/${pages.home}`)).status).toBe(404);
    });
  });

  describe('aperçu avec les droits d’un groupe', () => {
    it('identique à la page vue par un membre de ce seul groupe', async () => {
      await setContent(pages.home, [
        buttons(
          ['Accueil', { kind: 'page', pageId: pages.home }],
          ['Tournoi', { kind: 'page', pageId: pages.tournoi }],
          ['Mon espace', { kind: 'personal_page' }],
        ),
      ]);

      const preview = (
        await admin.get(`/admin/pages/${pages.home}/preview?asGroup=${groups.common}`)
      ).body as AssembledPage;
      // Bob n'est membre que de « Partie commune » et n'a pas de page personnelle.
      const seen = (await bob.get(`/pages/${pages.home}`)).body as AssembledPage;
      expect(preview.zones).toEqual(seen.zones);
      expect(labels(preview.zones.main)).toEqual(['Accueil']);

      const full = (await admin.get(`/admin/pages/${pages.home}/preview`)).body as AssembledPage;
      expect(labels(full.zones.main)).toEqual(['Accueil', 'Tournoi']);
    });

    it('fonctionne aussi pour le header ; groupe inconnu ou supprimé → 404', async () => {
      const part = (await admin.get('/admin/layout/header/draft')).body;
      await admin.send('put', '/admin/layout/header/draft', {
        config: {
          rows: [
            buttons(
              ['Accueil', { kind: 'page', pageId: pages.home }],
              ['Tournoi', { kind: 'page', pageId: pages.tournoi }],
            ),
          ],
        },
        version: part.version,
      });
      await admin.send('post', '/admin/layout/header/publish');

      const preview = (await admin.get(`/admin/layout/header/preview?asGroup=${groups.common}`))
        .body as AssembledRow[];
      expect(preview).toEqual((await bob.get('/layout')).body.header);
      // Header et footer publiés qui encadrent l'aperçu d'une page.
      const framing = await admin.get(`/admin/pages/preview/layout?asGroup=${groups.common}`);
      expect(framing.body).toEqual((await bob.get('/layout')).body);
      expect(labels(preview)).toEqual(['Accueil']);

      expect((await admin.get(`/admin/pages/${pages.home}/preview?asGroup=${uid()}`)).status).toBe(
        404,
      );
      await admin.send('delete', `/admin/groups/${groups.members}`);
      expect(
        (await admin.get(`/admin/layout/header/preview?asGroup=${groups.members}`)).status,
      ).toBe(404);
    });
  });
});
