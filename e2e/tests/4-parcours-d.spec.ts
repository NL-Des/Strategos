import { expect, type Locator, type Page, test } from '@playwright/test';
import {
  adminNav,
  clickAndWait,
  expandRows,
  firstLogin,
  loginAsAdmin,
  openCreate,
  selectByText,
  t,
} from './helpers.ts';

/**
 * Parcours D — Espace privé d'un joueur (12) : modèle de page « Espace joueur »,
 * instancié pour Arkan (plages et mappings à refaire), groupe personnel, page
 * personnelle et bouton « Mon espace » du header ; Arkan y accède, puis à ses
 * notes et à ses soumissions par le menu de compte.
 */
test.describe.configure({ mode: 'serial' });

const row = (page: Page, n: number): Locator => page.locator('.row-editor').nth(n);

async function addBlock(page: Page, type: string): Promise<Locator> {
  await page
    .getByRole('button', { name: t('builder.addRow') })
    .last()
    .click();
  const last = page.locator('.row-editor').last();
  await last.getByLabel(t('builder.addBlock')).selectOption(type);
  return last;
}

async function insertGold(rich: Locator): Promise<void> {
  await rich.getByRole('button', { name: t('builder.rich.value') }).click();
  await rich.getByLabel(t('builder.data.sourceFile')).selectOption({ label: 'Guilde' });
  await rich.getByLabel(t('builder.data.sheet')).selectOption('Arkan');
  await rich.getByLabel(t('builder.data.cell')).fill('E1');
  await rich.getByRole('button', { name: t('builder.rich.insertValue'), exact: true }).click();
}

async function configureTable(table: Locator): Promise<void> {
  await table.getByLabel(t('builder.data.sourceFile')).selectOption({ label: 'Guilde' });
  await table.getByLabel(t('builder.data.sheet')).selectOption('Arkan');
  await table.getByLabel(t('builder.data.rangeMode')).selectOption('extensible');
  await table.getByLabel(t('builder.data.columns'), { exact: true }).fill('A:B');
  // Deux colonnes affichées : Objet et Quantité.
  const columns = table.getByRole('group', { name: t('builder.data.tableColumns') });
  const remove = columns.getByRole('button', { name: t('builder.remove') });
  while ((await remove.count()) > 2) await remove.last().click();
}

test('1. Nadia crée le modèle de page « Espace joueur »', async ({ page }) => {
  await loginAsAdmin(page);
  await adminNav(page, 'pages');
  const create = await openCreate(page, t('builder.pages.create'));
  await create.getByLabel(t('builder.pages.name')).fill('Espace joueur');
  await create.getByRole('button', { name: t('builder.pages.createSubmit') }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Espace joueur' })).toBeVisible();

  await configureTable(await addBlock(page, 'table'));
  const rich = await addBlock(page, 'rich_content');
  await rich.locator('.ProseMirror').click();
  await page.keyboard.type('Or : ');
  await insertGold(rich);

  const form = await addBlock(page, 'form');
  await form.getByRole('button', { name: t('builder.form.create') }).click();
  await form.getByLabel(t('builder.form.title')).fill('Mes ressources');
  await form.getByLabel(t('builder.data.sourceFile')).first().selectOption({ label: 'Guilde' });
  await form.getByLabel(t('builder.data.sheet')).first().selectOption('Arkan');
  await form.getByRole('button', { name: t('builder.form.addField') }).click();
  const field = form.getByRole('group', { name: t('builder.form.field', { n: 1 }) });
  await field.getByLabel(t('builder.form.label')).fill('Or');
  await field.getByLabel(t('builder.form.key')).fill('or');
  await field.getByLabel(t('builder.form.cell')).fill('E1');
  await field.getByLabel(t('builder.form.type')).selectOption('number');
  await clickAndWait(page, page.getByRole('button', { name: t('builder.saveDraft') }), '/draft');
  await clickAndWait(page, form.getByRole('button', { name: t('builder.form.save') }), '/draft');

  // Enregistrer la page comme modèle.
  const toolbar = page.locator('.save-template').first();
  await toolbar.getByRole('button', { name: t('templates.save') }).click();
  await page.getByLabel(t('templates.name')).fill('Espace joueur');
  await clickAndWait(
    page,
    page.getByRole('button', { name: t('templates.saveSubmit') }),
    '/templates',
  );
});

test('2. instancié pour Arkan : feuille « Arkan », groupe personnel, publication', async ({
  page,
}) => {
  await loginAsAdmin(page);
  await adminNav(page, 'templates');
  const template = page.locator('li, article, .card').filter({ hasText: 'Espace joueur' }).last();
  await template.getByLabel(t('templates.pageName')).fill('Espace d’Arkan');
  await template.getByRole('button', { name: t('templates.instantiatePage') }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Espace d’Arkan' })).toBeVisible();

  // La copie est un brouillon aux plages et mappings vides.
  await expandRows(page);
  await expect(page.getByText(t('builder.data.notConfigured'))).toBeVisible();
  await configureTable(row(page, 0));
  const rich = row(page, 1);
  await expect(rich.locator('.ProseMirror')).toContainText('{E1}');
  await rich.locator('.ProseMirror').click();
  // Le repère laissé par le modèle est remplacé par la valeur de la feuille d'Arkan.
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+Home');
  await page.keyboard.type('Or : ');
  await insertGold(rich);
  const form = row(page, 2);
  await form.getByLabel(t('builder.data.sheet')).first().selectOption('Arkan');
  await form.getByLabel(t('builder.form.cell')).fill('E1');
  await clickAndWait(page, page.getByRole('button', { name: t('builder.saveDraft') }), '/draft');
  await clickAndWait(page, form.getByRole('button', { name: t('builder.form.save') }), '/draft');
  await page.getByRole('button', { name: t('builder.publish') }).click();
  await expect(page.getByText(t('builder.published'))).toBeVisible();

  // Groupe personnel « Arkan », qui lit sa page.
  await adminNav(page, 'groups');
  const groupForm = await openCreate(page, t('admin.groups.create'));
  await groupForm.getByLabel(t('fields.name')).fill('Arkan');
  await groupForm.getByRole('button', { name: t('admin.groups.createSubmit') }).click();
  await page.getByRole('checkbox', { name: 'arkan', exact: true }).check();
  await clickAndWait(
    page,
    page.getByRole('button', { name: t('admin.group.saveMembers') }),
    '/members',
  );
  await page.getByRole('checkbox', { name: /^Espace d’Arkan/ }).check();
  await clickAndWait(
    page,
    page.getByRole('button', { name: t('admin.group.savePermissions') }),
    '/permissions',
  );
});

test('3. « Ma page personnelle » : fiche d’Arkan et bouton « Mon espace » du header', async ({
  page,
}) => {
  await loginAsAdmin(page);
  await adminNav(page, 'users');
  await page.getByRole('link', { name: 'arkan', exact: true }).click();
  await selectByText(page.getByLabel(t('fields.personalPageId')), 'Espace d’Arkan');
  await clickAndWait(
    page,
    page.getByRole('button', { name: t('common.save') }).first(),
    '/admin/users/',
  );

  await adminNav(page, 'header');
  await expandRows(page);
  const buttons = row(page, 0);
  await buttons.getByRole('button', { name: t('builder.buttons.add') }).click();
  const mine = buttons.getByRole('group', { name: t('builder.buttons.button', { n: 4 }) });
  await mine.getByLabel(t('builder.buttons.label')).fill('Mon espace');
  await mine.getByLabel(t('builder.link.kind')).selectOption('personal_page');
  await page.getByRole('button', { name: t('builder.publish') }).click();
  await expect(page.getByText(t('builder.published'))).toBeVisible();
});

test('4. Arkan ouvre son espace, puis ses notes et ses soumissions', async ({ page }) => {
  await firstLogin(page, 'arkan');
  await page.getByRole('link', { name: 'Mon espace' }).click();
  await expect(page.getByRole('cell', { name: 'Potion' })).toBeVisible();
  await expect(page.getByText('Or : 250')).toBeVisible();

  // Proposer une nouvelle quantité d'or : visible ensuite dans « mes soumissions ».
  await page.getByLabel('Or', { exact: true }).fill('300');
  await page.getByRole('button', { name: t('forms.submit') }).click();
  await expect(page.getByText(t('forms.sent'))).toBeVisible();

  await page.getByRole('button', { name: t('account.menu') }).click();
  await page.getByRole('menuitem', { name: t('account.notes') }).click();
  await page.getByRole('button', { name: t('notes.new') }).click();
  await page.getByLabel(t('fields.title')).fill('Butin du raid');
  await page.locator('.ProseMirror').click();
  await page.keyboard.type('Garder les potions pour le boss.');
  await page.getByRole('button', { name: t('notes.create') }).click();
  await expect(page.getByRole('heading', { name: 'Butin du raid' })).toBeVisible();

  await page.getByRole('button', { name: t('account.menu') }).click();
  await page.getByRole('menuitem', { name: t('account.submissions') }).click();
  await expect(page.getByText('Mes ressources')).toBeVisible();
  await expect(page.getByText(t('submissions.status.pending'))).toBeVisible();
});
