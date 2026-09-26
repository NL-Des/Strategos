import type { NestExpressApplication } from '@nestjs/platform-express';
import type { AdminPage, AssembledPage, PageConfig, Row } from '@strategos/shared';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  PNG,
  TestClient,
  adminClient,
  createTestApp,
  expectStatus,
  resetDatabase,
  uid,
  userClient,
} from './helpers.js';

const rich = (html: string): Row => ({
  id: uid(),
  columns: [{ width: '1/1', block: { id: uid(), type: 'rich_content', config: { html } } }],
});

const buttonsTo = (...targets: { label: string; pageId?: string; url?: string }[]): Row => ({
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
          buttons: targets.map((t) => ({
            id: uid(),
            label: t.label,
            target: t.pageId ? { kind: 'page', pageId: t.pageId } : { kind: 'url', url: t.url! },
          })),
        },
      },
    },
  ],
});

const config = (main: Row[], extra: Partial<PageConfig> = {}): PageConfig => ({
  zones: { main, sidebar: null },
  themeId: null,
  showHeader: true,
  showFooter: true,
  ...extra,
});

describe('Pages (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: TestClient;
  let kira: TestClient;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    admin = await adminClient(app);
    kira = await userClient(app, admin, 'kira');
  });

  afterAll(async () => {
    await app.close();
  });

  async function createPage(name: string): Promise<AdminPage> {
    const res = await admin.send('post', '/admin/pages', { name });
    expectStatus(res, 201);
    return res.body as AdminPage;
  }

  async function saveDraft(page: AdminPage, draft: PageConfig, name = page.name) {
    return admin.send('put', `/admin/pages/${page.id}/draft`, {
      name,
      config: draft,
      version: page.version,
    });
  }

  async function publish(id: string): Promise<AdminPage> {
    const res = await admin.send('post', `/admin/pages/${id}/publish`);
    expectStatus(res, 200);
    return res.body as AdminPage;
  }

  describe('brouillon et publication', () => {
    it('page jamais publiée → 404 pour les utilisateurs, y compris l’admin côté site', async () => {
      const page = await createPage('Accueil');
      expect((await kira.get(`/pages/${page.id}`)).status).toBe(404);
      expect((await admin.get(`/pages/${page.id}`)).status).toBe(404);
    });

    it('un brouillon modifié reste invisible jusqu’à la publication', async () => {
      let page = await createPage('Accueil');
      page = (await saveDraft(page, config([rich('<p>Version 1</p>')]))).body;
      page = await publish(page.id);
      expect(JSON.stringify((await kira.get(`/pages/${page.id}`)).body)).toContain('Version 1');

      page = (await saveDraft(page, config([rich('<p>Version 2</p>')]))).body;
      const seen = JSON.stringify((await kira.get(`/pages/${page.id}`)).body);
      expect(seen).toContain('Version 1');
      expect(seen).not.toContain('Version 2');

      const preview = await admin.get(`/admin/pages/${page.id}/preview`);
      expect(JSON.stringify(preview.body)).toContain('Version 2');

      await publish(page.id);
      expect(JSON.stringify((await kira.get(`/pages/${page.id}`)).body)).toContain('Version 2');
    });

    it('thème et header/footer affichés suivent aussi la publication', async () => {
      let page = await createPage('Accueil');
      page = (await saveDraft(page, config([], { showHeader: false }))).body;
      page = await publish(page.id);
      expect((await kira.get(`/pages/${page.id}`)).body.showHeader).toBe(false);
      page = (await saveDraft(page, config([], { showHeader: true }))).body;
      expect((await kira.get(`/pages/${page.id}`)).body.showHeader).toBe(false);
    });

    it('les block.id restent stables d’une publication à l’autre', async () => {
      let page = await createPage('Accueil');
      const row = rich('<p>a</p>');
      page = (await saveDraft(page, config([row]))).body;
      await publish(page.id);
      page = (await admin.get(`/admin/pages/${page.id}`)).body;
      page = (await saveDraft(page, config([row, rich('<p>b</p>')]))).body;
      await publish(page.id);
      const seen = (await kira.get(`/pages/${page.id}`)).body as AssembledPage;
      expect(seen.zones.main![0]!.id).toBe(row.id);
      expect(seen.zones.main![0]!.columns[0]!.block!.id).toBe(row.columns[0]!.block!.id);
    });

    it('version périmée → 409 EDIT_CONFLICT', async () => {
      const page = await createPage('Accueil');
      expectStatus(await saveDraft(page, config([])), 200);
      const stale = await saveDraft(page, config([]));
      expect(stale.status).toBe(409);
      expect(stale.body.code).toBe('EDIT_CONFLICT');
    });

    it('config validée par le schéma du module', async () => {
      const page = await createPage('Accueil');
      const bad = config([
        {
          id: uid(),
          columns: [
            { width: '1/1', block: { id: uid(), type: 'image', config: { alt: 1 } } as never },
          ],
        },
      ]);
      const res = await saveDraft(page, bad);
      expect(res.status).toBe(400);
      expect(Object.keys(res.body.details.fields)).toEqual(
        expect.arrayContaining([
          'config.zones.main[0].columns[0].block.config.mediaId',
          'config.zones.main[0].columns[0].block.config.alt',
        ]),
      );
    });

    it('HTML du contenu libre nettoyé côté backend', async () => {
      const page = await createPage('Accueil');
      const res = await saveDraft(
        page,
        config([rich('<p onclick="x()">ok</p><script>alert(1)</script>')]),
      );
      const block = (res.body as AdminPage).draft.zones.main![0]!.columns[0]!.block!;
      expect(block.config).toEqual({ html: '<p>ok</p>' });
    });

    it('page supprimée → 404, et ses liens disparaissent', async () => {
      const target = await createPage('Cible');
      await publish(target.id);
      let home = await createPage('Accueil');
      home = (
        await saveDraft(
          home,
          config([
            buttonsTo(
              { label: 'Cible', pageId: target.id },
              { label: 'Web', url: 'https://ex.org' },
            ),
          ]),
        )
      ).body;
      await publish(home.id);
      expect((await admin.send('delete', `/admin/pages/${target.id}`)).status).toBe(204);
      expect((await kira.get(`/pages/${target.id}`)).status).toBe(404);
      const seen = (await kira.get(`/pages/${home.id}`)).body as AssembledPage;
      const block = seen.zones.main![0]!.columns[0]!.block!;
      expect(block.type === 'buttons' && block.config.buttons.map((b) => b.label)).toEqual(['Web']);
    });

    it('liens vers une page jamais publiée retirés pour l’utilisateur, gardés dans l’aperçu admin', async () => {
      const draftOnly = await createPage('Brouillon');
      let home = await createPage('Accueil');
      home = (
        await saveDraft(home, config([buttonsTo({ label: 'Brouillon', pageId: draftOnly.id })]))
      ).body;
      await publish(home.id);
      const seen = (await kira.get(`/pages/${home.id}`)).body as AssembledPage;
      expect(seen.zones.main![0]!.columns[0]!.block).toBeNull();
      const preview = (await admin.get(`/admin/pages/${home.id}/preview`)).body as AssembledPage;
      expect(preview.zones.main![0]!.columns[0]!.block).not.toBeNull();
    });
  });

  describe('header et footer partagés', () => {
    const layoutRow = (type: string, cfg: object = {}): Row =>
      ({ id: uid(), columns: [{ width: '1/1', block: { id: uid(), type, config: cfg } }] }) as Row;

    it('formulaire, espace ou chat → 422 BLOCK_NOT_ALLOWED_IN_LAYOUT', async () => {
      for (const kind of ['header', 'footer']) {
        const part = (await admin.get(`/admin/layout/${kind}/draft`)).body;
        for (const type of ['form', 'discussion_space', 'chat']) {
          const res = await admin.send('put', `/admin/layout/${kind}/draft`, {
            config: { rows: [layoutRow(type)] },
            version: part.version,
          });
          expect(res.status).toBe(422);
          expect(res.body.code).toBe('BLOCK_NOT_ALLOWED_IN_LAYOUT');
        }
      }
    });

    it('brouillon, publication et lecture filtrée', async () => {
      const target = await createPage('Tournoi');
      await publish(target.id);
      const secret = await createPage('Secret');
      const part = (await admin.get('/admin/layout/header/draft')).body;
      expectStatus(
        await admin.send('put', '/admin/layout/header/draft', {
          config: {
            rows: [
              buttonsTo(
                { label: 'Tournoi', pageId: target.id },
                { label: 'Secret', pageId: secret.id },
              ),
            ],
          },
          version: part.version,
        }),
        200,
      );
      expect((await kira.get('/layout')).body).toEqual({ header: null, footer: null });

      expectStatus(await admin.send('post', '/admin/layout/header/publish'), 200);
      const layout = (await kira.get('/layout')).body;
      const block = layout.header[0].columns[0].block;
      expect(block.config.buttons.map((b: { label: string }) => b.label)).toEqual(['Tournoi']);
      expect(layout.footer).toBeNull();
    });

    it('kind inconnu → 400', async () => {
      expect((await admin.get('/admin/layout/sidebar/draft')).status).toBe(400);
    });
  });

  describe('journal', () => {
    it('publications de pages, du header et du footer tracées', async () => {
      const page = await createPage('Accueil');
      await publish(page.id);
      await admin.send('post', '/admin/layout/header/publish');
      await admin.send('post', '/admin/layout/footer/publish');
      const actions = (await prisma.auditLog.findMany({ orderBy: { id: 'asc' } })).map(
        (e) => `${e.action}:${JSON.stringify(e.after)}`,
      );
      expect(actions.filter((a) => a.startsWith('page.publish'))).toHaveLength(1);
      expect(actions.filter((a) => a.startsWith('layout.publish'))).toEqual([
        expect.stringContaining('"kind":"header"'),
        expect.stringContaining('"kind":"footer"'),
      ]);
    });
  });

  describe('accès', () => {
    it('routes admin des pages → 404 pour un non-admin', async () => {
      expect((await kira.get('/admin/pages')).status).toBe(404);
      expect((await kira.upload('/admin/media', PNG, 'x.png')).status).toBe(404);
    });
  });
});
