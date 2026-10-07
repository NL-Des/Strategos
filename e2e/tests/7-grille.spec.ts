import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { buildXlsx } from '../../apps/backend/test/xlsx.ts';
import { adminNav, clickAndWait, loginAsAdmin, openCreate, t } from './helpers.ts';

/**
 * Grille d'un Excel uploadé (04 — Sources) : l'admin voit la version de
 * référence comme un tableur, avec les formules, sans calcul. Puis la même
 * grille sur le Google Sheet ajouté par le parcours A.
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
  await openCreate(page, t('sources.upload'));
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

test('2. l’assistant de formules décompose et aide à écrire, en français', async ({ page }) => {
  await loginAsAdmin(page);
  await adminNav(page, 'sources');
  await page
    .getByRole('row', { name: /inventaire\.xlsx/ })
    .getByRole('link', { name: t('sources.grid.open') })
    .click();
  const grid = page.locator('table.source-grid');
  const panel = page.getByRole('complementary', { name: t('sources.grid.formula.tabs') });
  const content = page.getByLabel(t('sources.grid.content'));
  const row = (n: number) =>
    grid.locator('tr', { has: page.getByRole('rowheader', { name: String(n), exact: true }) });

  // Lecture : D2 = B2*C2, décomposée avec les valeurs enregistrées des cellules citées.
  await grid.getByRole('cell', { name: /^12/ }).click();
  await expect(content).toHaveValue('=B2*C2');
  await expect(panel).toContainText(t('sources.grid.formula.ops.multiply'));
  await expect(panel).toContainText(t('sources.grid.formula.nodes.value', { value: '5' }));
  await expect(panel).toContainText(t('sources.grid.formula.nodes.value', { value: '4' }));
  await expect(row(2).locator('td').nth(1)).toHaveClass(/ref-cell/);

  // Construction en F2 : guide des arguments, références par clic, catalogue.
  await row(2).locator('td').nth(5).dblclick();
  await expect(page.locator('.grid-formula-bar')).toContainText('F2');
  await expect(content).toBeFocused();
  await content.fill('=SOMME(');
  await expect(panel).toContainText(t('sources.grid.formula.arguments', { name: 'SOMME' }));
  await row(2).locator('td').nth(1).click();
  await row(3)
    .locator('td')
    .nth(1)
    .click({ modifiers: ['Shift'] });
  await expect(content).toHaveValue('=SOMME(B2:B3');
  await content.pressSequentially(')+');
  await panel.getByRole('button', { name: t('sources.grid.formula.functions') }).click();
  await panel.getByLabel(t('sources.grid.formula.search')).fill('moyenne');
  await panel
    .getByRole('button', {
      name: t('sources.grid.formula.insert', { name: 'MOYENNE' }),
      exact: true,
    })
    .click();
  await expect(content).toHaveValue('=SOMME(B2:B3)+MOYENNE()');
  await content.pressSequentially('C2;1,5');
  await expect(content).toHaveValue('=SOMME(B2:B3)+MOYENNE(C2;1,5)');
  await page.screenshot({ path: `${SHOTS}/grille-formule.png`, fullPage: true });

  // Stockée dans la syntaxe du fichier, relue en français.
  const saved = page.waitForResponse((r) => r.request().method() === 'PATCH' && r.ok());
  await content.press('Enter');
  const cell = await (await saved).json();
  expect(cell.formula).toBe('SUM(B2:B3)+AVERAGE(C2,1.5)');
  await expect(content).toHaveValue('=SOMME(B2:B3)+MOYENNE(C2;1,5)');
});

test('3. la même grille sur un Google Sheet : Google calcule, fonctions de Google au catalogue', async ({
  page,
}) => {
  await loginAsAdmin(page);
  await adminNav(page, 'sources');
  await page
    .getByRole('row', { name: /Guilde/ })
    .getByRole('link', { name: t('sources.grid.open') })
    .click();
  await expect(page.getByRole('heading', { name: 'Guilde' })).toBeVisible();
  const grid = page.locator('table.source-grid');
  const panel = page.getByRole('complementary', { name: t('sources.grid.formula.tabs') });
  const bar = page.locator('.grid-formula-bar');
  const content = page.getByLabel(t('sources.grid.content'));
  const first = grid.locator('tr', {
    has: page.getByRole('rowheader', { name: '1', exact: true }),
  });

  // Lecture : la formule du Sheet, en français, décomposée.
  await first.locator('td').nth(5).click();
  await expect(content).toHaveValue('=64-NBVAL(A2:A65)');
  await expect(panel).toContainText(t('formulas.functions.COUNTA'));
  await expect(panel).toContainText(t('sources.grid.formula.notComputedGsheet'));

  // Écriture en J1 : signature de Google pour FILTRE, fonction propre à Google au catalogue.
  await first.locator('td').nth(9).dblclick();
  await expect(bar).toContainText('J1');
  await content.fill('=FILTRE(');
  await expect(panel).toContainText(t('formulas.args.condition.label'));
  await content.fill('');
  await panel.getByRole('button', { name: t('sources.grid.formula.functions') }).click();
  await panel.getByLabel(t('sources.grid.formula.search')).fill('countunique');
  await panel
    .getByRole('button', {
      name: t('sources.grid.formula.insert', { name: 'COUNTUNIQUE' }),
      exact: true,
    })
    .click();
  await content.pressSequentially('B2:B');
  await expect(content).toHaveValue('=COUNTUNIQUE(B2:B)');
  await page.screenshot({ path: `${SHOTS}/grille-google-sheet.png`, fullPage: true });

  const saved = page.waitForResponse((r) => r.request().method() === 'PATCH' && r.ok());
  await content.press('Enter');
  const cell = await (await saved).json();
  expect(cell).toMatchObject({ formula: 'COUNTUNIQUE(B2:B)', needsRecalc: false });
  await expect(content).toHaveValue('=COUNTUNIQUE(B2:B)');
  await expect(bar).not.toContainText(t('render.needsRecalc'));
});
