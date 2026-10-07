import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { PLAYER_PASSWORD } from '../stack.ts';
import { adminNav, login, loginAsAdmin, openAdminPage, t } from './helpers.ts';

/**
 * Sidebar commune et mode sombre (06) : Nadia construit la sidebar une fois et
 * l'affiche sur l'accueil ; Kira passe le site en mode sombre depuis son menu
 * de compte. Les captures « sombre_ », dans `e2e/screenshots/`, servent à la
 * relecture visuelle.
 */
test.describe.configure({ mode: 'serial' });

const SHOTS = resolve(import.meta.dirname, '../screenshots');
mkdirSync(SHOTS, { recursive: true });
/** Fond du thème fourni « Sombre », et de l'interface en mode sombre. */
const DARK_BACKGROUND = 'rgb(20, 23, 28)';

const colorMode = (page: Page) => page.evaluate(() => document.documentElement.dataset.colorMode);
const background = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);

async function shot(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  await page.screenshot({
    path: `${SHOTS}/sombre${path.replaceAll('/', '_') || '_accueil'}.png`,
    fullPage: true,
  });
}

async function toggleMode(page: Page, key: 'darkMode' | 'lightMode'): Promise<void> {
  await page.getByRole('button', { name: t('account.menu') }).click();
  await page.getByRole('menuitem', { name: t(`account.${key}`) }).click();
}

test('1. sidebar commune : construite une fois, affichée par la page qui la choisit', async ({
  page,
  browser,
}) => {
  await loginAsAdmin(page);
  await adminNav(page, 'sidebar');
  await page.getByRole('button', { name: t('builder.addRow') }).click();
  await page.getByLabel(t('builder.addBlock')).first().selectOption('rich_content');
  await page.locator('.ProseMirror').first().click();
  await page.keyboard.type('Menu de la guilde');
  await page.getByRole('button', { name: t('builder.publish') }).click();
  await expect(page.getByText(t('builder.published'))).toBeVisible();

  // Par défaut, une page n'affiche pas la sidebar commune.
  const kira = await browser.newPage();
  await login(kira, 'kira', PLAYER_PASSWORD);
  await expect(kira.getByText('Bienvenue chez les Loups Gris !')).toBeVisible();
  await expect(kira.locator('.zone-sidebar')).toHaveCount(0);

  await openAdminPage(page, 'Accueil');
  await page
    .getByLabel(new RegExp(`^${t('builder.zoneNames.sidebar')}`))
    .selectOption({ label: t('builder.sidebarModes.shared') });
  await page.getByRole('button', { name: t('builder.publish') }).click();
  await expect(page.getByText(t('builder.published')).last()).toBeVisible();

  await kira.reload();
  await expect(kira.locator('.zone-sidebar')).toContainText('Menu de la guilde');
  await kira.close();
});

test('2. Kira passe en mode sombre : pages au thème « Sombre », choix gardé', async ({ page }) => {
  await login(page, 'kira', PLAYER_PASSWORD);
  await expect(page.getByText('Bienvenue chez les Loups Gris !')).toBeVisible();
  expect(await colorMode(page)).toBe('light');
  const light = await background(page, '.themed');

  await toggleMode(page, 'darkMode');
  expect(await colorMode(page)).toBe('dark');
  expect(await background(page, '.themed')).toBe(DARK_BACKGROUND);

  // Le choix est retenu dans le navigateur, y compris hors des pages construites.
  await page.reload();
  await expect(page.getByText('Bienvenue chez les Loups Gris !')).toBeVisible();
  expect(await colorMode(page)).toBe('dark');
  for (const path of ['', '/submissions', '/profile', '/notes']) await shot(page, path);
  expect(await background(page, 'body')).toBe(DARK_BACKGROUND);

  await page.goto('/');
  await toggleMode(page, 'lightMode');
  expect(await colorMode(page)).toBe('light');
  expect(await background(page, '.themed')).toBe(light);
});

test('3. administration en mode sombre', async ({ page }) => {
  await loginAsAdmin(page);
  await toggleMode(page, 'darkMode');
  for (const path of [
    '/admin/submissions',
    '/admin/pages',
    '/admin/layout/sidebar',
    '/admin/themes',
    '/admin/sources',
    '/admin/settings',
    '/admin/audit',
  ]) {
    await shot(page, path);
  }
  expect(await background(page, 'body')).toBe(DARK_BACKGROUND);
  // « Sombre » est désigné pour le mode sombre dès l'installation.
  await page.goto('/admin/settings');
  await expect(
    page.getByLabel(new RegExp(`^${t('settings.darkTheme')}`)).locator('option:checked'),
  ).toHaveText('Sombre');
});
