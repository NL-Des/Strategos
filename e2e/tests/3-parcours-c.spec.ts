import { expect, type Locator, type Page, test } from '@playwright/test';
import { PLAYER_PASSWORD } from '../stack.ts';
import {
  adminNav,
  clickAndWait,
  firstLogin,
  login,
  loginAsAdmin,
  openAdminPage,
  section,
  t,
} from './helpers.ts';

/**
 * Parcours C — Gestion de stock (12) : `stock.xlsx` relié par OneDrive, page
 * « Stock » avec un Catalogue, formulaire de ligne lancé depuis la carte du
 * produit, mouvements concurrents sans conflit, puis validation automatique.
 */
test.describe.configure({ mode: 'serial' });

/** Image PNG de 1 × 1 pixel. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

let stockPageId = '';

async function addBlock(page: Page, type: string): Promise<Locator> {
  await page
    .getByRole('button', { name: t('builder.addRow') })
    .last()
    .click();
  const last = page.locator('.row-editor').last();
  await last.getByLabel(t('builder.addBlock')).selectOption(type);
  return last;
}

/** Carte du produit 137, trouvée par la recherche du Catalogue. */
async function product137(page: Page): Promise<Locator> {
  await page.goto(`/pages/${stockPageId}`);
  await page.getByLabel(t('render.search')).fill('Produit 137');
  const card = page.locator('.catalog-card').filter({ hasText: 'Produit 137' });
  await expect(card).toHaveCount(1);
  return card;
}

async function propose(page: Page, movement: string): Promise<void> {
  const card = await product137(page);
  await card.getByRole('button', { name: t('forms.proposeChange') }).click();
  await card.getByLabel('Quantité').fill(movement);
  await card.getByRole('button', { name: t('forms.submit') }).click();
  await expect(card.getByText(t('forms.sent'))).toBeVisible();
}

test('1. OneDrive connecté (accès délégué), stock.xlsx relié', async ({ page }) => {
  await loginAsAdmin(page);
  await adminNav(page, 'sources');
  await page.getByRole('link', { name: t('sources.onedrive.connect') }).click();
  await expect(page.getByText(t('sources.onedrive.connectedNow'))).toBeVisible();
  await expect(page.getByText('marc@entreprise.fr')).toBeVisible();
  await page.getByRole('button', { name: t('sources.onedrive.browse') }).click();
  await page
    .getByRole('listitem')
    .filter({ hasText: 'stock.xlsx' })
    .getByRole('button', { name: t('sources.onedrive.add') })
    .click();
  await expect(page.getByRole('row', { name: /stock\.xlsx/ })).toBeVisible();
});

test('2. page « Stock » : Catalogue avec images de la médiathèque, formulaire de ligne', async ({
  page,
}) => {
  await loginAsAdmin(page);
  await adminNav(page, 'media');
  await page.getByLabel(t('builder.media.file')).setInputFiles({
    name: 'carton.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await page.getByLabel(t('builder.image.alt')).fill('Carton');
  await clickAndWait(
    page,
    page.getByRole('button', { name: t('builder.media.uploadSubmit') }),
    '/media',
  );

  await adminNav(page, 'pages');
  const create = section(page, t('builder.pages.create'));
  await create.getByLabel(t('builder.pages.name')).fill('Stock');
  await create.getByRole('button', { name: t('builder.pages.createSubmit') }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Stock' })).toBeVisible();
  stockPageId = page.url().split('/').at(-1)!;

  const catalog = await addBlock(page, 'catalog');
  await catalog.getByLabel(t('builder.data.sourceFile')).selectOption({ label: 'stock.xlsx' });
  await catalog.getByLabel(t('builder.data.imageCol')).selectOption('D');
  await catalog.getByLabel(t('builder.data.titleCol')).selectOption('B');
  for (const col of ['A', 'C']) {
    await catalog.getByRole('button', { name: t('builder.data.addDetail') }).click();
    await catalog.getByLabel(t('builder.data.column'), { exact: true }).last().selectOption(col);
  }

  const form = await addBlock(page, 'form');
  await form.getByLabel(t('builder.form.mode')).selectOption('ligne');
  await form.getByRole('button', { name: t('builder.form.create') }).click();
  await form.getByLabel(t('builder.form.title')).fill('Signaler le stock');
  await form.getByLabel(t('builder.data.sourceFile')).first().selectOption({ label: 'stock.xlsx' });
  await form
    .getByLabel(t('builder.form.linkedBlock'))
    .selectOption({ label: `${t('builder.blockTypes.catalog')} 1` });
  await form.getByLabel(t('builder.form.keyCol')).fill('A');
  await form.getByLabel(t('builder.form.rowStart')).fill('2');
  await form.getByRole('button', { name: t('builder.form.addField') }).click();
  const field = form.getByRole('group', { name: t('builder.form.field', { n: 1 }) });
  await field.getByLabel(t('builder.form.label')).fill('Quantité');
  await field.getByLabel(t('builder.form.key')).fill('quantite');
  await field.getByLabel(t('builder.form.col')).fill('C');
  await field.getByLabel(t('builder.form.type')).selectOption('number');
  await field.getByLabel(t('builder.form.required')).check();
  await field.getByLabel(t('builder.form.movement')).check();
  // Le Catalogue relié doit figurer dans le brouillon enregistré de la page.
  await clickAndWait(page, page.getByRole('button', { name: t('builder.saveDraft') }), '/draft');
  await clickAndWait(page, form.getByRole('button', { name: t('builder.form.save') }), '/draft');

  await page.getByRole('button', { name: t('builder.publish') }).click();
  await expect(page.getByText(t('builder.published'))).toBeVisible();

  // Toute l'équipe lit la page.
  await adminNav(page, 'groups');
  await page.getByRole('link', { name: 'Partie commune' }).click();
  await page.getByRole('checkbox', { name: /^Stock/ }).check();
  await clickAndWait(
    page,
    page.getByRole('button', { name: t('admin.group.savePermissions') }),
    '/permissions',
  );
});

test('3. Julie (−3) et Paul (−1) proposent un mouvement sur le produit 137', async ({
  browser,
}) => {
  const julie = await browser.newPage();
  await firstLogin(julie, 'julie');
  const card = await product137(julie);
  await expect(card.locator('img')).toHaveAttribute('src', /\/api\/v1\/media\//);
  await expect(card).toContainText('8');
  await propose(julie, '-3');
  await julie.close();

  const paul = await browser.newPage();
  await firstLogin(paul, 'paul');
  await propose(paul, '-1');
  await paul.close();
});

test('4. Marc valide les deux mouvements, sans conflit : stock final 4', async ({ page }) => {
  await loginAsAdmin(page);
  await adminNav(page, 'submissions');
  const cards = page.locator('.submission-item');
  await expect(cards).toHaveCount(2);
  await expect(page.locator('.submission-item.conflict')).toHaveCount(0);
  // Paul d'abord : l'ordre ne change rien au résultat.
  for (const user of ['paul', 'julie']) {
    await clickAndWait(
      page,
      cards
        .filter({ hasText: user })
        .getByRole('button', { name: t('submissions.admin.validate') }),
      '/validate',
    );
  }
  await expect(cards).toHaveCount(0);
  const card = await product137(page);
  await expect(card.locator('dd').last()).toHaveText('4');
});

test('5. validation automatique : le mouvement suivant est écrit sans attendre', async ({
  page,
  browser,
}) => {
  await loginAsAdmin(page);
  await openAdminPage(page, 'Stock');
  await clickAndWait(
    page,
    page.getByLabel(t('builder.form.autoValidate')),
    /\/admin\/forms\/[^/]+\/settings/,
  );

  const julie = await browser.newPage();
  await login(julie, 'julie', PLAYER_PASSWORD);
  await propose(julie, '-1');
  await julie.getByRole('button', { name: t('account.menu') }).click();
  await julie.getByRole('menuitem', { name: t('account.submissions') }).click();
  await expect(julie.getByText(t('submissions.status.validated'))).toHaveCount(2);
  const card = await product137(julie);
  await expect(card.locator('dd').last()).toHaveText('3');
  await julie.close();
});
