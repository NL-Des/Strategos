import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { buildXlsx } from '../../apps/backend/test/xlsx.ts';
import { adminNav, clickAndWait, loginAsAdmin, t } from './helpers.ts';

/**
 * Grille d'un Excel uploadé (04 — Sources) : l'admin voit la version de
 * référence comme un tableur, avec les formules, sans calcul.
 */
test.describe.configure({ mode: 'serial' });

const SHOTS = resolve(import.meta.dirname, '../screenshots');

test('1. l’admin uploade inventaire.xlsx et ouvre ses cellules', async ({ page }) => {
  const file = await buildXlsx({
    Inventaire: {
      A1: 'Objet',
      B1: 'Quantité',
      C1: 'Prix',
      D1: 'Total',
      A2: 'Corde',
      B2: 3,
      C2: 4,
      D2: { formula: 'B2*C2', result: 12 },
    },
    Notes: { A1: 'Rien' },
  });
  await loginAsAdmin(page);
  await adminNav(page, 'sources');
  await page.getByLabel(t('fields.file')).setInputFiles({
    name: 'inventaire.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: file,
  });
  await clickAndWait(
    page,
    page.getByRole('button', { name: t('sources.uploadSubmit') }),
    '/admin/sources/upload',
  );

  await page
    .getByRole('row', { name: /inventaire\.xlsx/ })
    .getByRole('link', { name: t('sources.grid.open') })
    .click();
  await expect(page.getByRole('heading', { name: 'inventaire.xlsx' })).toBeVisible();
  const grid = page.locator('table.source-grid');
  await expect(grid.getByRole('columnheader', { name: 'D', exact: true })).toBeVisible();
  await expect(grid.getByRole('cell', { name: 'Corde' })).toBeVisible();

  await grid.getByRole('cell', { name: '12', exact: true }).click();
  const bar = page.locator('.grid-formula-bar');
  const content = page.getByLabel(t('sources.grid.content'));
  await expect(bar).toContainText('D2');
  await expect(content).toHaveValue('=B2*C2');

  // Quantité modifiée : le total (formule) passe « à recalculer », sans calcul.
  await grid.getByRole('cell', { name: '3', exact: true }).click();
  await content.fill('5');
  await clickAndWait(page, bar.getByRole('button', { name: t('common.save') }), '/cells');
  await expect(grid.getByRole('cell', { name: '5', exact: true })).toBeVisible();
  await expect(grid.getByRole('cell', { name: /^12/ })).toContainText('*');

  // Nouvelle formule en E2, validée par Entrée.
  await grid
    .locator('tr', { has: page.getByRole('rowheader', { name: '2', exact: true }) })
    .locator('td')
    .nth(4)
    .dblclick();
  await expect(content).toBeFocused();
  await content.fill('=D2*2');
  await content.press('Enter');
  await expect(content).toHaveValue('=D2*2');
  await expect(bar).toContainText(t('render.needsRecalc'));
  await page.screenshot({ path: `${SHOTS}/grille-edition.png`, fullPage: true });

  await page.getByLabel(t('sources.grid.goTo')).fill('A60');
  await page.getByRole('button', { name: t('sources.grid.goToSubmit') }).click();
  await expect(grid.getByRole('rowheader', { name: '51', exact: true })).toBeVisible();
  await page.getByRole('button', { name: t('sources.grid.rowsUp') }).click();
  await expect(grid.getByRole('rowheader', { name: '1', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  await expect(grid.getByRole('cell', { name: 'Rien' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/grille-desktop.png`, fullPage: true });
});
