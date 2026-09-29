import { expect, test } from '@playwright/test';
import { PLAYER_PASSWORD } from '../stack.ts';
import { adminNav, clickAndWait, login, loginAsAdmin, section, t } from './helpers.ts';

/**
 * Corbeille (04) : un sujet et un groupe supprimés, retrouvés par type, puis
 * restaurés ; la restauration est tracée au journal. Réglages : sauvegardes.
 */
test.describe.configure({ mode: 'serial' });

test('1. l’admin supprime un sujet et un groupe', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/');
  await page.getByRole('link', { name: 'Tournoi' }).click();
  await page.getByRole('button', { name: /Qui fait équipe avec moi/ }).click();
  page.once('dialog', (dialog) => void dialog.accept());
  await clickAndWait(
    page,
    page.getByRole('button', { name: t('render.discussion.deleteTopic') }),
    '/admin/topics/',
  );
  await expect(page.getByRole('button', { name: /Qui fait équipe avec moi/ })).toHaveCount(0);

  await adminNav(page, 'groups');
  const create = section(page, t('admin.groups.create'));
  await create.getByLabel(t('fields.name')).fill('Anciens');
  await create.getByRole('button', { name: t('admin.groups.createSubmit') }).click();
  page.once('dialog', (dialog) => void dialog.accept());
  await clickAndWait(
    page,
    page.getByRole('button', { name: t('admin.group.delete') }),
    '/admin/groups/',
  );
});

test('2. corbeille filtrée par type, restauration tracée au journal', async ({ page }) => {
  await loginAsAdmin(page);
  await adminNav(page, 'trash');
  await expect(page.getByRole('row', { name: /Qui fait équipe avec moi/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /Anciens/ })).toBeVisible();

  await page.getByLabel(t('trash.type')).selectOption('group');
  await expect(page.getByRole('row', { name: /Qui fait équipe avec moi/ })).toHaveCount(0);
  await page.getByLabel(t('trash.type')).selectOption('topic');
  const topic = page.getByRole('row', { name: /Qui fait équipe avec moi/ });
  await expect(topic).toContainText('kira');
  await clickAndWait(page, topic.getByRole('button', { name: t('trash.restore') }), '/restore');
  await expect(
    page.getByText(t('trash.restored', { label: 'Qui fait équipe avec moi ?' })),
  ).toBeVisible();
  await expect(page.getByText(t('trash.empty'))).toBeVisible();

  await adminNav(page, 'audit');
  await expect(
    page.getByRole('row', { name: new RegExp(t('audit.actions.trash.restore')) }),
  ).toBeVisible();
});

test('3. le sujet restauré reparaît pour Kira ; les sauvegardes sont listées', async ({
  page,
  browser,
}) => {
  const kira = await browser.newPage();
  await login(kira, 'kira', PLAYER_PASSWORD);
  await kira.getByRole('link', { name: 'Tournoi' }).click();
  await expect(kira.getByRole('button', { name: /Qui fait équipe avec moi/ })).toBeVisible();
  await kira.close();

  await loginAsAdmin(page);
  await adminNav(page, 'settings');
  await expect(page.getByRole('heading', { name: t('backups.title') })).toBeVisible();
  await expect(page.getByText(t('backups.empty'))).toBeVisible();
});
