import type { NestExpressApplication } from '@nestjs/platform-express';
import { type AdminPage, DEFAULT_THEME_CONFIG, type MediaItem } from '@strategos/shared';
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

describe('Médiathèque et réglages (e2e)', () => {
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

  async function upload(name = 'epee.png'): Promise<MediaItem> {
    const res = await admin.upload('/admin/media', PNG, name, { alt: 'Une épée' });
    expectStatus(res, 201);
    return res.body as MediaItem;
  }

  async function pageUsing(mediaId: string, name = 'Armurerie'): Promise<AdminPage> {
    const page = (await admin.send('post', '/admin/pages', { name })).body as AdminPage;
    const res = await admin.send('put', `/admin/pages/${page.id}/draft`, {
      name,
      version: page.version,
      config: {
        zones: {
          main: [
            {
              id: uid(),
              columns: [
                {
                  width: '1/1',
                  block: {
                    id: uid(),
                    type: 'image',
                    config: { mediaId, alt: 'Épée', size: 'fit', align: 'center' },
                  },
                },
              ],
            },
          ],
          sidebar: null,
        },
        themeId: null,
        showHeader: true,
        showFooter: true,
        showSidebar: false,
      },
    });
    expectStatus(res, 200);
    return res.body as AdminPage;
  }

  describe('upload et lecture', () => {
    it('image envoyée, lisible par tout utilisateur connecté, pas sans session', async () => {
      const media = await upload();
      expect(media).toMatchObject({ filename: 'epee.png', mime: 'image/png', alt: 'Une épée' });
      const res = await kira.get(`/media/${media.id}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/png');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(Buffer.compare(res.body as Buffer, PNG)).toBe(0);
      expect((await new TestClient(app).get(`/media/${media.id}`)).status).toBe(401);
    });

    it('type vérifié sur le contenu : un faux PNG → 415', async () => {
      const res = await admin.upload('/admin/media', Buffer.from('<svg onload=alert(1)>'), 'x.png');
      expect(res.status).toBe(415);
      expect(res.body.code).toBe('UNSUPPORTED_FILE_TYPE');
    });

    it('fichier trop gros → 413 FILE_TOO_LARGE', async () => {
      const big = Buffer.concat([PNG, Buffer.alloc(10 * 1024 * 1024)]);
      const res = await admin.upload('/admin/media', big, 'grosse.png');
      expect(res.status).toBe(413);
      expect(res.body.code).toBe('FILE_TOO_LARGE');
    });

    it('nom déjà pris → 409 MEDIA_NAME_TAKEN ; réutilisable après suppression', async () => {
      const media = await upload();
      const taken = await admin.upload('/admin/media', PNG, 'epee.png');
      expect(taken.status).toBe(409);
      expect(taken.body.code).toBe('MEDIA_NAME_TAKEN');
      await admin.send('delete', `/admin/media/${media.id}`, {});
      await upload();
    });

    it('liste paginée et recherche', async () => {
      await upload('epee.png');
      await upload('bouclier.png');
      const res = await admin.get('/admin/media?q=bou');
      expect(res.body).toMatchObject({ total: 1, items: [{ filename: 'bouclier.png' }] });
    });
  });

  describe('suppression', () => {
    it('image utilisée → 409 CONFIRMATION_REQUIRED avec les pages ; confirm: true passe', async () => {
      const media = await upload();
      const page = await pageUsing(media.id);
      const warned = await admin.send('delete', `/admin/media/${media.id}`, {});
      expect(warned.status).toBe(409);
      expect(warned.body).toMatchObject({
        code: 'CONFIRMATION_REQUIRED',
        details: {
          warnings: [
            { code: 'MEDIA_IN_USE', pages: [{ id: page.id, name: 'Armurerie' }], layouts: [] },
          ],
        },
      });

      const confirmed = await admin.send('delete', `/admin/media/${media.id}`, { confirm: true });
      expect(confirmed.status).toBe(204);
      expect((await kira.get(`/media/${media.id}`)).status).toBe(404);
      const preview = await admin.get(`/admin/pages/${page.id}/preview`);
      expect(preview.body.zones.main[0].columns[0].block).toBeNull();
    });

    it('image en fond de thème → 409 avec le thème', async () => {
      const media = await upload();
      const theme = await admin.send('post', '/admin/themes', {
        name: 'Nuit',
        config: {
          ...DEFAULT_THEME_CONFIG,
          background: { color: '#000000', imageMediaId: media.id },
        },
      });
      expectStatus(theme, 201);
      const warned = await admin.send('delete', `/admin/media/${media.id}`, {});
      expect(warned.status).toBe(409);
      expect(warned.body.details.warnings[0]).toMatchObject({
        code: 'MEDIA_IN_USE',
        pages: [],
        themes: [{ id: theme.body.id, name: 'Nuit' }],
      });
    });

    it('image inutilisée → supprimée directement, tracée au journal', async () => {
      const media = await upload();
      expect((await admin.send('delete', `/admin/media/${media.id}`, {})).status).toBe(204);
      const actions = (await prisma.auditLog.findMany()).map((e) => e.action);
      expect(actions).toEqual(expect.arrayContaining(['media.upload', 'media.delete']));
    });
  });

  describe('réglages de l’instance', () => {
    it('page d’arrivée et thème par défaut ; la page d’arrivée apparaît dans Me', async () => {
      const settings = (await admin.get('/admin/settings')).body;
      expect(settings).toMatchObject({ landingPageId: null, backupRetentionDays: 7, version: 1 });
      const themes = (await admin.get('/admin/themes')).body;
      expect(themes.map((t: { name: string }) => t.name)).toEqual(['Sobre']);

      const page = (await admin.send('post', '/admin/pages', { name: 'Accueil' })).body;
      const res = await admin.send('put', '/admin/settings', {
        landingPageId: page.id,
        defaultThemeId: themes[0].id,
        backupRetentionDays: 14,
        version: settings.version,
      });
      expect(res.body).toMatchObject({
        landingPageId: page.id,
        backupRetentionDays: 14,
        version: 2,
      });
      expect((await kira.get('/auth/me')).body.landingPageId).toBe(page.id);

      await admin.send('delete', `/admin/pages/${page.id}`);
      expect((await kira.get('/auth/me')).body.landingPageId).toBeNull();
    });

    it('version périmée → 409 ; page ou thème inconnu → 400 ; tracé au journal', async () => {
      const settings = (await admin.get('/admin/settings')).body;
      const body = {
        landingPageId: null,
        defaultThemeId: settings.defaultThemeId,
        backupRetentionDays: 7,
      };
      expectStatus(await admin.send('put', '/admin/settings', { ...body, version: 1 }), 200);
      expect((await admin.send('put', '/admin/settings', { ...body, version: 1 })).status).toBe(
        409,
      );
      const unknown = await admin.send('put', '/admin/settings', {
        ...body,
        landingPageId: uid(),
        defaultThemeId: uid(),
        version: 2,
      });
      expect(unknown.body.details.fields).toEqual({
        landingPageId: ['notFound'],
        defaultThemeId: ['notFound'],
      });
      expect(await prisma.auditLog.count({ where: { action: 'settings.update' } })).toBe(1);
    });
  });
});
