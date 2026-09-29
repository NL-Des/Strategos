import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import { ADMIN, PLAYER_PASSWORD, TEMPORARY_PASSWORD } from '../stack.ts';

type Messages = { [key: string]: string | Messages };
const fr = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../apps/frontend/src/i18n/fr.json'), 'utf8'),
) as Messages;

/** Valeur d'une clé ; un segment peut lui-même contenir des points (`audit.actions.trash.restore`). */
function lookup(node: string | Messages | undefined, parts: string[]): string | undefined {
  if (parts.length === 0) return typeof node === 'string' ? node : undefined;
  if (typeof node !== 'object') return undefined;
  for (let n = 1; n <= parts.length; n++) {
    const found = lookup(node[parts.slice(0, n).join('.')], parts.slice(n));
    if (found !== undefined) return found;
  }
  return undefined;
}

/** Texte de l'interface, lu dans le fichier de traduction (comme i18next). */
export function t(key: string, vars: Record<string, string | number> = {}): string {
  const value = lookup(fr, key.split('.'));
  if (value === undefined) throw new Error(`Clé de traduction inconnue : ${key}`);
  return value.replace(/{{(\w+)}}/g, (_m, name: string) => String(vars[name] ?? ''));
}

export async function login(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(t('fields.username')).fill(username);
  await page.getByLabel(t('fields.password'), { exact: true }).fill(password);
  await page.getByRole('button', { name: t('login.submit') }).click();
  await expect(page.getByRole('button', { name: t('login.submit') })).toBeHidden();
}

export async function loginAsAdmin(page: Page): Promise<void> {
  await login(page, ADMIN.username, ADMIN.password);
}

/** Première connexion d'un joueur : mot de passe temporaire, puis changement forcé. */
export async function firstLogin(page: Page, username: string): Promise<void> {
  await login(page, username, TEMPORARY_PASSWORD);
  await expect(page.getByRole('heading', { name: t('changeCredentials.title') })).toBeVisible();
  await page.getByLabel(t('fields.currentPassword')).fill(TEMPORARY_PASSWORD);
  await page.getByLabel(t('fields.newPassword')).first().fill(PLAYER_PASSWORD);
  await page.getByLabel(t('fields.confirmation')).fill(PLAYER_PASSWORD);
  await page.getByRole('button', { name: t('common.save') }).click();
  await expect(page.getByRole('heading', { name: t('changeCredentials.title') })).toBeHidden();
}

/** Lien de la navigation d'administration ; attend l'écran visé. */
export async function adminNav(page: Page, key: string): Promise<void> {
  if (!page.url().includes('/admin')) await page.goto('/admin/pages');
  const link = page
    .getByRole('navigation', { name: t('admin.title') })
    .getByRole('link', { name: t(`admin.nav.${key}`) })
    .first();
  const href = await link.getAttribute('href');
  const title = page.getByRole('heading', { level: 1 }).first();
  const before = new URL(page.url()).pathname === href ? null : await title.textContent();
  await link.click();
  await page.waitForURL((url) => url.pathname === href);
  // L'écran précédent reste affiché le temps du rendu : on attend le nouveau titre.
  if (before) await expect(title).not.toHaveText(before);
}

/** Choisit l'option d'un `<select>` dont le texte commence par `text` (ex. « Tournoi (jamais publiée) »). */
export async function selectByText(select: Locator, text: string): Promise<void> {
  const option = select.locator('option').filter({ hasText: new RegExp(`^${escape(text)}`) });
  const value = await option.first().getAttribute('value');
  await select.selectOption(value ?? '');
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Clique, puis attend la réponse réussie de l'API dont le chemin contient `path`. */
export async function clickAndWait(page: Page, target: Locator, path: string | RegExp) {
  const response = page.waitForResponse(
    (r) =>
      r.request().method() !== 'GET' &&
      (typeof path === 'string' ? r.url().includes(path) : path.test(r.url())),
  );
  await target.click();
  const res = await response;
  if (!res.ok()) throw new Error(`${res.status()} ${res.url()} : ${await res.text()}`);
  return res;
}

/** Le formulaire (ou la carte) qui porte ce titre. */
export function section(page: Page, heading: string): Locator {
  return page
    .locator('form, section, .card')
    .filter({ has: page.getByRole('heading', { name: heading, exact: true }) })
    .last();
}

/** Ouvre une page dans le page builder. */
export async function openAdminPage(page: Page, name: string): Promise<void> {
  await adminNav(page, 'pages');
  await page.getByRole('link', { name, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}
