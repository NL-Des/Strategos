import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { PLAYER_PASSWORD } from '../stack.ts';
import { login, loginAsAdmin } from './helpers.ts';

/**
 * Écrans sur mobile, tablette et bureau : aucune page ne défile horizontalement
 * (les tableaux larges défilent dans leur cadre). Les captures, dans
 * `e2e/screenshots/`, servent à la relecture visuelle.
 */
const VIEWPORTS = {
  mobile: { width: 375, height: 740 },
  tablette: { width: 768, height: 1024 },
  bureau: { width: 1280, height: 800 },
};
const SHOTS = resolve(import.meta.dirname, '../screenshots');
mkdirSync(SHOTS, { recursive: true });

const ADMIN_SCREENS = [
  '/admin/submissions',
  '/admin/pages',
  '/admin/layout/header',
  '/admin/layout/sidebar',
  '/admin/media',
  '/admin/themes',
  '/admin/templates',
  '/admin/sources',
  '/admin/users',
  '/admin/groups',
  '/admin/rights',
  '/admin/settings',
  '/admin/audit',
  '/admin/trash',
];
const USER_SCREENS = ['/', '/profile', '/notes', '/submissions'];
/** Pages construites (Tournoi, Stock), relevées côté admin pour les ouvrir en joueur. */
const builtPages: string[] = [];

/** Écrans dont l'adresse dépend des données : ouverts par leur lien. */
async function linkedScreens(page: Page): Promise<string[]> {
  const found: string[] = [];
  for (const [list, name] of [
    ['/admin/pages', 'Tournoi'],
    ['/admin/pages', 'Stock'],
    ['/admin/users', 'kira'],
    ['/admin/groups', 'Membres'],
    ['/admin/themes', 'Sobre'],
  ]) {
    await page.goto(list!);
    const href = await page.getByRole('link', { name, exact: true }).first().getAttribute('href');
    found.push(href!);
    if (href!.startsWith('/admin/pages/')) builtPages.push(href!.replace('/admin', ''));
  }
  return found;
}

async function check(page: Page, path: string, label: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  await page.screenshot({
    path: `${SHOTS}/${label}${path.replaceAll('/', '_') || '_accueil'}.png`,
    fullPage: true,
  });
  expect.soft(overflow, `${path} déborde de ${overflow} px (${label})`).toBeLessThanOrEqual(0);
}

for (const [label, viewport] of Object.entries(VIEWPORTS)) {
  test.describe(label, () => {
    test.use({ viewport });

    test('écrans d’administration', async ({ page }) => {
      await loginAsAdmin(page);
      for (const path of [...ADMIN_SCREENS, ...(await linkedScreens(page))]) {
        await check(page, path, label);
      }
    });

    test('écrans des joueurs', async ({ page }) => {
      await login(page, 'kira', PLAYER_PASSWORD);
      for (const path of [...USER_SCREENS, ...builtPages]) await check(page, path, label);
    });
  });
}
