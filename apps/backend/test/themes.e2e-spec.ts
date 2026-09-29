import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  type AdminPage,
  type AssembledPage,
  DEFAULT_THEME_CONFIG,
  type Theme,
  type ThemeConfig,
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
  userClient,
} from './helpers.js';

const dark: ThemeConfig = {
  ...DEFAULT_THEME_CONFIG,
  background: { color: '#101418', imageMediaId: null },
  text: { ...DEFAULT_THEME_CONFIG.text, color: '#f0f0f0', font: 'serif', headingFont: 'slab' },
  buttons: { ...DEFAULT_THEME_CONFIG.buttons, style: 'outline' },
};

describe('Thèmes (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: TestClient;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    admin = await adminClient(app);
  });

  afterAll(async () => {
    await app.close();
  });

  async function createTheme(name: string, config: ThemeConfig = dark): Promise<Theme> {
    const res = await admin.send('post', '/admin/themes', { name, config });
    expectStatus(res, 201);
    return res.body as Theme;
  }

  it('création, lecture, modification et liste ; le thème de l’installation est le thème par défaut', async () => {
    const theme = await createTheme('Nuit');
    expect(theme).toMatchObject({ name: 'Nuit', config: dark, version: 1, isDefault: false });
    expect((await admin.get(`/admin/themes/${theme.id}`)).body).toEqual(theme);

    const updated = await admin.send('put', `/admin/themes/${theme.id}`, {
      name: 'Nuit noire',
      config: { ...dark, cards: { ...dark.cards, shadow: true } },
      version: 1,
    });
    expectStatus(updated, 200);
    expect(updated.body).toMatchObject({ name: 'Nuit noire', version: 2 });
    expect((updated.body as Theme).config.cards.shadow).toBe(true);

    const list = (await admin.get('/admin/themes')).body as Theme[];
    expect(list.map((t) => [t.name, t.isDefault])).toEqual([
      ['Nuit noire', false],
      ['Sobre', true],
    ]);
    expect(list[1]!.config).toEqual(DEFAULT_THEME_CONFIG);

    const actions = await prisma.auditLog.findMany({
      where: { targetType: 'theme', targetId: theme.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(actions.map((a) => a.action)).toEqual(['theme.create', 'theme.update']);
  });

  it('modification concurrente → 409 EDIT_CONFLICT ; nom déjà pris → 409 THEME_NAME_TAKEN', async () => {
    const theme = await createTheme('Nuit');
    const body = { name: 'Nuit', config: dark, version: 1 };
    expectStatus(await admin.send('put', `/admin/themes/${theme.id}`, body), 200);
    const stale = await admin.send('put', `/admin/themes/${theme.id}`, body);
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('EDIT_CONFLICT');

    const taken = await admin.send('post', '/admin/themes', { name: 'sobre', config: dark });
    expect(taken.status).toBe(409);
    expect(taken.body.code).toBe('THEME_NAME_TAKEN');
  });

  it('config invalide : couleur, police hors liste, réglage inconnu, image absente', async () => {
    const res = await admin.send('post', '/admin/themes', {
      name: 'Faux',
      config: {
        ...dark,
        text: { ...dark.text, color: 'red', font: 'Comic Sans' },
        cards: { ...dark.cards, glow: true },
      },
    });
    expect(res.status).toBe(400);
    expect(res.body.details.fields).toMatchObject({
      'config.text.color': expect.any(Array),
      'config.text.font': expect.any(Array),
      'config.cards.glow': expect.any(Array),
    });

    const missing = await admin.send('post', '/admin/themes', {
      name: 'Fond',
      config: {
        ...dark,
        background: { color: '#000000', imageMediaId: '0190f5c0-0000-7000-8000-00000000abcd' },
      },
    });
    expect(missing.status).toBe(400);
    expect(missing.body.details.fields).toEqual({ 'config.background.imageMediaId': ['notFound'] });

    const media = await admin.upload('/admin/media', PNG, 'fond.png');
    expectStatus(media, 201);
    const withImage = await createTheme('Fond', {
      ...dark,
      background: { color: '#000000', imageMediaId: media.body.id as string },
    });
    expect(withImage.config.background.imageMediaId).toBe(media.body.id);
  });

  it('supprimer le thème par défaut → 422 DEFAULT_THEME', async () => {
    const sobre = ((await admin.get('/admin/themes')).body as Theme[])[0]!;
    const res = await admin.send('delete', `/admin/themes/${sobre.id}`);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('DEFAULT_THEME');
    expect((await admin.get('/admin/themes')).body).toHaveLength(1);
  });

  it('page sans thème → thème par défaut ; thème supprimé → la page et son brouillon reviennent au défaut', async () => {
    const kira = await userClient(app, admin, 'kira');
    const sobre = ((await admin.get('/admin/themes')).body as Theme[])[0]!;
    const theme = await createTheme('Nuit');
    const page = (await admin.send('post', '/admin/pages', { name: 'Taverne' })).body as AdminPage;
    await createGroup(admin, 'Lecteurs', { userIds: [await meId(kira)], pageIds: [page.id] });
    const seen = async () => ((await kira.get(`/pages/${page.id}`)).body as AssembledPage).theme;

    const published = await admin.send('post', `/admin/pages/${page.id}/publish`);
    expectStatus(published, 200);
    expect(await seen()).toEqual({ id: sobre.id, config: DEFAULT_THEME_CONFIG });

    const saved = await admin.send('put', `/admin/pages/${page.id}/draft`, {
      name: page.name,
      config: { ...page.draft, themeId: theme.id },
      version: (published.body as AdminPage).version,
    });
    expectStatus(saved, 200);
    expectStatus(await admin.send('post', `/admin/pages/${page.id}/publish`), 200);
    expect(await seen()).toEqual({ id: theme.id, config: dark });

    expectStatus(await admin.send('delete', `/admin/themes/${theme.id}`), 204);
    expect(await seen()).toEqual({ id: sobre.id, config: DEFAULT_THEME_CONFIG });
    const after = (await admin.get(`/admin/pages/${page.id}`)).body as AdminPage;
    expect(after.draft.themeId).toBeNull();
    expectStatus(
      await admin.send('put', `/admin/pages/${page.id}/draft`, {
        name: after.name,
        config: after.draft,
        version: after.version,
      }),
      200,
    );
    expect(
      await prisma.auditLog.count({ where: { action: 'theme.delete', targetId: theme.id } }),
    ).toBe(1);
  });

  it('routes réservées à l’admin', async () => {
    const kira = await userClient(app, admin, 'kira');
    expect((await kira.get('/admin/themes')).status).toBe(404);
    expect((await kira.send('post', '/admin/themes', { name: 'X', config: dark })).status).toBe(
      404,
    );
  });
});
