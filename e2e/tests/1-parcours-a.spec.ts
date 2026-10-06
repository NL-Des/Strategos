import { expect, type Page, test } from '@playwright/test';
import { ADMIN, SHEET_ID, TEMPORARY_PASSWORD } from '../stack.ts';
import {
  adminNav,
  clickAndWait,
  firstLogin,
  login,
  loginAsAdmin,
  openCreate,
  selectByText,
  t,
} from './helpers.ts';

/**
 * Parcours A — Première installation (12) : Nadia change les identifiants par
 * défaut, connecte son compte Google et choisit le Sheet de la guilde, crée groupes et comptes, construit
 * le header et l'accueil ; Kira se connecte et arrive sur l'accueil.
 */
test.describe.configure({ mode: 'serial' });

const PLAYERS = ['kira', 'arkan', 'julie', 'paul'];
const GROUPS: Record<string, string[]> = {
  'Partie commune': PLAYERS,
  Membres: ['kira', 'arkan'],
  Officiers: [],
};

async function createPage(page: Page, name: string): Promise<void> {
  await adminNav(page, 'pages');
  const form = await openCreate(page, t('builder.pages.create'));
  await form.getByLabel(t('builder.pages.name')).fill(name);
  await form.getByRole('button', { name: t('builder.pages.createSubmit') }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

test('1. identifiants par défaut changés à la première connexion', async ({ page }) => {
  await login(page, 'admin', 'admin');
  await expect(page.getByRole('heading', { name: t('changeCredentials.title') })).toBeVisible();
  await page.getByLabel(t('fields.newUsername')).fill(ADMIN.username);
  await page.getByLabel(t('fields.currentPassword')).fill('admin');
  await page.getByLabel(t('fields.newPassword')).first().fill(ADMIN.password);
  await page.getByLabel(t('fields.confirmation')).fill(ADMIN.password);
  await page.getByRole('button', { name: t('common.save') }).click();
  await expect(page.getByRole('heading', { name: t('changeCredentials.title') })).toBeHidden();

  // Les anciens identifiants ne marchent plus.
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel(t('fields.username')).fill('admin');
  await page.getByLabel(t('fields.password'), { exact: true }).fill('admin');
  await page.getByRole('button', { name: t('login.submit') }).click();
  await expect(page.getByText(t('errors.AUTH_INVALID_CREDENTIALS'))).toBeVisible();
});

/**
 * Le sélecteur de fichiers de Google, remplacé par un faux qui choisit aussitôt
 * le Sheet de la guilde : les tests n'appellent jamais Google.
 */
const FAKE_PICKER = `
  class Builder {
    addView() { return this; }
    enableFeature() { return this; }
    setOAuthToken(token) { this.token = token; return this; }
    setDeveloperKey() { return this; }
    setAppId() { return this; }
    setOrigin() { return this; }
    setLocale() { return this; }
    setCallback(callback) { this.callback = callback; return this; }
    build() {
      return {
        setVisible: () =>
          this.callback(
            this.token.startsWith('google-access-')
              ? { action: 'picked', docs: [{ id: '${SHEET_ID}' }] }
              : { action: 'cancel' },
          ),
      };
    }
  }
  window.google = {
    picker: {
      PickerBuilder: Builder,
      DocsView: class { setMode() { return this; } },
      ViewId: { SPREADSHEETS: 'spreadsheets' },
      DocsViewMode: { LIST: 'list' },
      Feature: { MULTISELECT_ENABLED: 'multiselect' },
      Action: { PICKED: 'picked', CANCEL: 'cancel' },
    },
  };
  window.gapi = { load: (api, options) => options.callback() };
`;

test('2. écran Sources : identifiants Google saisis, compte connecté, Sheet choisi et testé', async ({
  page,
}) => {
  await page.route('https://apis.google.com/js/api.js', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: FAKE_PICKER }),
  );
  await loginAsAdmin(page);
  await adminNav(page, 'sources');
  await openCreate(page, t('sources.gsheet.title'));
  // Rien n'est configuré : le guide donne les deux adresses à déclarer chez Google.
  await expect(page.getByText(t('sources.gsheet.setup.steps.consent.note'))).toBeVisible();
  await expect(page.getByLabel(t('sources.gsheet.setup.origin'))).toHaveValue(
    new URL(page.url()).origin,
  );
  await expect(page.getByLabel(t('sources.gsheet.setup.redirectUri'))).toHaveValue(
    /\/api\/v1\/google\/callback$/,
  );
  await page
    .getByLabel(t('sources.gsheet.setup.clientId'))
    .fill('123456789-client-test.apps.googleusercontent.com');
  await page.getByLabel(t('sources.gsheet.setup.clientSecret')).fill('secret-test');
  await page.getByLabel(t('sources.gsheet.setup.apiKey')).fill('api-key-test');
  await page.getByRole('button', { name: t('sources.gsheet.setup.save') }).click();
  await page.getByRole('link', { name: t('sources.gsheet.connect') }).click();
  await expect(page.getByText(t('sources.gsheet.connectedNow'))).toBeVisible();
  await expect(page.getByText(/nadia@exemple\.fr/)).toBeVisible();
  await page.getByRole('button', { name: t('sources.gsheet.pick') }).click();
  const row = page.getByRole('row', { name: /Guilde/ });
  await expect(row).toBeVisible();
  await expect(row.getByText(t('sources.statuses.ok'))).toBeVisible();
  await row.getByRole('button', { name: t('sources.test') }).click();
  await expect(row.getByText(t('sources.statuses.ok'))).toBeVisible();
});

test('3. groupes et comptes des joueurs (mot de passe temporaire)', async ({ page }) => {
  await loginAsAdmin(page);
  for (const username of PLAYERS) {
    await adminNav(page, 'users');
    const form = await openCreate(page, t('admin.users.create'));
    await form.getByLabel(t('fields.username')).fill(username);
    await form.getByLabel(t('fields.temporaryPassword')).fill(TEMPORARY_PASSWORD);
    await form.getByRole('button', { name: t('admin.users.createSubmit') }).click();
    await expect(page.getByRole('heading', { name: username })).toBeVisible();
  }
  for (const [name, members] of Object.entries(GROUPS)) {
    await adminNav(page, 'groups');
    const form = await openCreate(page, t('admin.groups.create'));
    await form.getByLabel(t('fields.name')).fill(name);
    await form.getByRole('button', { name: t('admin.groups.createSubmit') }).click();
    await expect(page.getByRole('button', { name: t('admin.group.saveMembers') })).toBeVisible();
    for (const username of members) {
      await page.getByRole('checkbox', { name: username, exact: true }).check();
    }
    await clickAndWait(
      page,
      page.getByRole('button', { name: t('admin.group.saveMembers') }),
      '/members',
    );
  }
  await adminNav(page, 'groups');
  await expect(page.getByRole('row', { name: /Partie commune/ })).toContainText('4');
});

test('4. header partagé, page d’accueil publiée et désignée page d’arrivée', async ({ page }) => {
  await loginAsAdmin(page);
  // Pages visées par la barre de boutons ; Tournoi et Taverne seront construites ensuite.
  for (const name of ['Tournoi', 'Taverne', 'Accueil']) await createPage(page, name);

  // Accueil : un Contenu libre.
  await page.getByRole('button', { name: t('builder.addRow') }).click();
  await page.getByLabel(t('builder.addBlock')).first().selectOption('rich_content');
  const editor = page.locator('.ProseMirror').first();
  await editor.click();
  await page.keyboard.type('Bienvenue chez les Loups Gris !');
  await page.getByRole('button', { name: t('builder.publish') }).click();
  await expect(page.getByText(t('builder.published'))).toBeVisible();

  // Header : barre de boutons Accueil, Tournoi, Taverne.
  await adminNav(page, 'header');
  await page.getByRole('button', { name: t('builder.addRow') }).click();
  await page.getByLabel(t('builder.addBlock')).first().selectOption('buttons');
  for (const [i, target] of ['Accueil', 'Tournoi', 'Taverne'].entries()) {
    if (i > 0) await page.getByRole('button', { name: t('builder.buttons.add') }).click();
    const button = page.getByRole('group', { name: t('builder.buttons.button', { n: i + 1 }) });
    await button.getByLabel(t('builder.buttons.label')).fill(target);
    await selectByText(button.getByLabel(t('builder.link.page'), { exact: true }), target);
  }
  await page.getByRole('button', { name: t('builder.publish') }).click();
  await expect(page.getByText(t('builder.published'))).toBeVisible();

  // « Partie commune » lit l'accueil.
  await adminNav(page, 'groups');
  await page.getByRole('link', { name: 'Partie commune' }).click();
  await page.getByRole('checkbox', { name: /^Accueil/ }).check();
  await clickAndWait(
    page,
    page.getByRole('button', { name: t('admin.group.savePermissions') }),
    '/permissions',
  );

  // Page d'arrivée.
  await adminNav(page, 'settings');
  await page.getByLabel(t('settings.landingPage')).selectOption({ label: 'Accueil' });
  await page.getByRole('button', { name: t('common.save') }).click();
  await expect(page.getByText(t('settings.saved'))).toBeVisible();
});

test('5. Kira arrive sur l’accueil, avec le menu de compte', async ({ page }) => {
  await firstLogin(page, 'kira');
  await expect(page.getByText('Bienvenue chez les Loups Gris !')).toBeVisible();
  // Tournoi et Taverne ne sont pas encore lisibles : leurs boutons sont retirés.
  await expect(page.getByRole('link', { name: 'Accueil' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Tournoi' })).toHaveCount(0);

  await page.getByRole('button', { name: t('account.menu') }).click();
  const menu = page.getByRole('menu');
  for (const key of ['account.profile', 'account.notes', 'account.submissions']) {
    await expect(menu.getByRole('menuitem', { name: t(key) })).toBeVisible();
  }
  await expect(menu.getByRole('menuitem', { name: t('admin.title') })).toHaveCount(0);
  await menu.getByRole('menuitem', { name: t('account.logout') }).click();
  await expect(page.getByRole('button', { name: t('login.submit') })).toBeVisible();
});
