import { expect, type Locator, type Page, test } from '@playwright/test';
import { adminNav, clickAndWait, login, loginAsAdmin, openAdminPage, t } from './helpers.ts';
import { PLAYER_PASSWORD } from '../stack.ts';

/**
 * Parcours B — Tournoi de guilde (12) : page « Tournoi » avec valeur insérée,
 * tableau en plage extensible, formulaire d'ajout et espace de discussion ;
 * Kira s'inscrit, Nadia valide, puis ferme les inscriptions.
 */
test.describe.configure({ mode: 'serial' });

/** Rangée `n` (à partir de 0) du Main de la page en construction. */
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

test('1. Nadia construit et publie la page « Tournoi »', async ({ page }) => {
  await loginAsAdmin(page);
  await openAdminPage(page, 'Tournoi');

  // Contenu libre, avec le nombre de places restantes lu dans le Sheet.
  const rich = await addBlock(page, 'rich_content');
  await rich.locator('.ProseMirror').click();
  await page.keyboard.type('Règlement : une équipe de quatre. Places restantes : ');
  await rich.getByRole('button', { name: t('builder.rich.value') }).click();
  await rich.getByLabel(t('builder.data.sourceFile')).selectOption({ label: 'Guilde' });
  await rich.getByLabel(t('builder.data.sheet')).selectOption('Inscriptions');
  await rich.getByLabel(t('builder.data.cell')).fill('F1');
  await rich.getByRole('button', { name: t('builder.rich.insertValue'), exact: true }).click();

  // Tableau en plage extensible A:D, en-têtes lus sur la première ligne.
  const table = await addBlock(page, 'table');
  await table.getByLabel(t('builder.data.sourceFile')).selectOption({ label: 'Guilde' });
  await table.getByLabel(t('builder.data.sheet')).selectOption('Inscriptions');
  await table.getByLabel(t('builder.data.columns'), { exact: true }).fill('A:D');
  await table.getByRole('button', { name: t('builder.data.addColumn') }).click();

  // Formulaire d'ajout : ligne de départ 2, 64 lignes au plus.
  const formRow = await addBlock(page, 'form');
  await formRow.getByLabel(t('builder.form.mode')).selectOption('ajout');
  await formRow.getByRole('button', { name: t('builder.form.create') }).click();
  await formRow.getByLabel(t('builder.form.title')).fill('Inscription au tournoi');
  await formRow.getByLabel(t('builder.data.sourceFile')).first().selectOption({ label: 'Guilde' });
  await formRow.getByLabel(t('builder.data.sheet')).first().selectOption('Inscriptions');
  await formRow.getByLabel(t('builder.form.startRow')).fill('2');
  await formRow.getByLabel(t('builder.form.maxNewRows')).fill('64');
  const fields: [string, string, (field: Locator) => Promise<void>][] = [
    [
      'Pseudo',
      'A',
      async (f) => {
        await f.getByLabel(t('builder.form.auto')).selectOption('pseudo');
      },
    ],
    [
      'Classe',
      'B',
      async (f) => {
        await f.getByLabel(t('builder.form.type')).selectOption('select');
        await f.getByLabel(t('builder.form.optionsKind')).selectOption('range');
        await f.getByLabel(t('builder.data.sourceFile')).selectOption({ label: 'Guilde' });
        await f.getByLabel(t('builder.data.sheet')).selectOption('Inscriptions');
        await f.getByLabel(t('builder.data.rangeRef')).fill('H2:H4');
        await f.getByLabel(t('builder.form.required')).check();
      },
    ],
    [
      'Niveau',
      'C',
      async (f) => {
        await f.getByLabel(t('builder.form.type')).selectOption('number');
        await f.getByLabel(t('builder.form.min')).fill('1');
        await f.getByLabel(t('builder.form.max')).fill('60');
        await f.getByLabel(t('builder.form.required')).check();
      },
    ],
    ['Équipe', 'D', async () => {}],
  ];
  for (const [i, [label, col, configure]] of fields.entries()) {
    await formRow.getByRole('button', { name: t('builder.form.addField') }).click();
    const field = formRow.getByRole('group', { name: t('builder.form.field', { n: i + 1 }) });
    await field.getByLabel(t('builder.form.label')).fill(label);
    await field
      .getByLabel(t('builder.form.key'))
      .fill(label === 'Équipe' ? 'equipe' : label.toLowerCase());
    await field.getByLabel(t('builder.form.col')).fill(col);
    await configure(field);
  }
  await clickAndWait(page, formRow.getByRole('button', { name: t('builder.form.save') }), '/draft');

  // Espace de discussion.
  const space = await addBlock(page, 'discussion_space');
  await space.getByLabel(t('builder.discussionSpace.name')).fill('Salle du tournoi');

  await page.getByRole('button', { name: t('builder.publish') }).click();
  await expect(page.getByText(t('builder.published'))).toBeVisible();
  await expect(row(page, 3)).toBeVisible();
});

test('2. « Membres » lit la page, ouvre des sujets et poste dans l’espace', async ({ page }) => {
  await loginAsAdmin(page);
  await adminNav(page, 'groups');
  await page.getByRole('link', { name: 'Membres' }).click();
  await page.getByRole('checkbox', { name: /^Tournoi/ }).check();
  const space = page.getByRole('group', { name: 'Salle du tournoi' });
  await space.getByLabel(t('rights.names.createTopic')).check();
  await space.getByLabel(t('rights.names.post')).check();
  await expect(space.getByLabel(t('rights.names.read'))).toBeChecked();
  await clickAndWait(
    page,
    page.getByRole('button', { name: t('admin.group.savePermissions') }),
    '/permissions',
  );
});

test('3. Kira s’inscrit : pseudo automatique, classe lue dans le Sheet', async ({ page }) => {
  await login(page, 'kira', PLAYER_PASSWORD);
  await page.getByRole('link', { name: 'Tournoi' }).click();
  await expect(page.getByText('Places restantes : 63')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Arkan' })).toBeVisible();

  const pseudo = page.getByLabel('Pseudo');
  await expect(pseudo).toHaveValue('kira');
  await expect(pseudo).not.toBeEditable();
  await expect(page.getByLabel('Classe').locator('option')).toHaveText([
    '',
    'Guerrier',
    'Mage',
    'Voleur',
  ]);
  await page.getByLabel('Classe').selectOption('Mage');
  await page.getByLabel('Niveau').fill('20');
  await page.getByLabel('Équipe').fill('Bleue');
  await page.getByRole('button', { name: t('forms.submit') }).click();
  await expect(page.getByText(t('forms.sent'))).toBeVisible();

  // Un sujet dans l'espace du tournoi.
  await page.getByRole('button', { name: t('render.discussion.newTopic') }).click();
  await page.getByLabel(t('render.discussion.topicTitle')).fill('Qui fait équipe avec moi ?');
  await page.getByLabel(t('render.discussion.message')).fill('Mage niveau 20, cherche équipe.');
  await page.getByRole('button', { name: t('render.discussion.openTopic') }).click();
  await expect(page.getByText('Mage niveau 20, cherche équipe.')).toBeVisible();
});

test('4. Nadia valide : la ligne est écrite, Kira voit « validée »', async ({ page, browser }) => {
  await loginAsAdmin(page);
  await adminNav(page, 'submissions');
  const card = page.locator('.submission-item').filter({ hasText: 'kira' });
  await expect(card.getByText('Mage')).toBeVisible();
  await clickAndWait(
    page,
    card.getByRole('button', { name: t('submissions.admin.validate') }),
    '/validate',
  );
  // Traitée, elle quitte la file des soumissions en attente.
  await expect(card).toHaveCount(0);

  const kira = await browser.newPage();
  await login(kira, 'kira', PLAYER_PASSWORD);
  await kira.getByRole('link', { name: 'Tournoi' }).click();
  await expect(kira.getByRole('cell', { name: 'kira', exact: true })).toBeVisible();
  await kira.getByRole('button', { name: t('account.menu') }).click();
  await kira.getByRole('menuitem', { name: t('account.submissions') }).click();
  await expect(kira.getByText(t('submissions.status.validated'))).toBeVisible();
  await kira.close();
});

test('5. la veille du tournoi, Nadia ferme les inscriptions', async ({ page, browser }) => {
  await loginAsAdmin(page);
  await openAdminPage(page, 'Tournoi');
  const formRow = row(page, 2);
  await clickAndWait(
    page,
    formRow.getByRole('button', { name: t('builder.form.close') }),
    '/close',
  );
  await expect(formRow.getByText(t('builder.form.isClosed'))).toBeVisible();

  const kira = await browser.newPage();
  await login(kira, 'kira', PLAYER_PASSWORD);
  await kira.getByRole('link', { name: 'Tournoi' }).click();
  await expect(kira.getByText(t('forms.state.closed'))).toBeVisible();
  await expect(kira.getByRole('button', { name: t('forms.submit') })).toBeDisabled();
  await kira.close();
});
