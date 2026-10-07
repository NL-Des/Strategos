import type { AppException } from '../common/app-exception.js';
import { validateLayoutConfig, validatePageConfig } from './config-validator.js';

const id = (n: number) => `0190f5c0-0000-7000-8000-${String(n).padStart(12, '0')}`;

const image = (n: number) => ({
  id: id(n),
  type: 'image',
  config: { mediaId: id(900), alt: 'Épée', size: 'fit', align: 'center' },
});

function errorOf(fn: () => unknown) {
  try {
    fn();
  } catch (error) {
    const e = error as AppException;
    return { status: e.getStatus(), body: e.getBody() };
  }
  throw new Error('aucune erreur');
}

describe('validatePageConfig', () => {
  it('accepte une page valide et garde les id', () => {
    const config = validatePageConfig({
      zones: {
        main: [{ id: id(1), columns: [{ width: '1/1', block: image(2) }] }],
        sidebar: null,
      },
      themeId: null,
      showHeader: true,
      showFooter: false,
      showSidebar: false,
    });
    expect(config.zones.main![0]!.columns[0]!.block!.id).toBe(id(2));
    expect(config.showFooter).toBe(false);
  });

  it('refuse la sidebar commune avec une sidebar propre à la page', () => {
    const { status, body } = errorOf(() =>
      validatePageConfig({ zones: { main: [], sidebar: [] }, themeId: null, showSidebar: true }),
    );
    expect(status).toBe(400);
    expect(body.details.fields).toEqual({ 'config.showSidebar': ['sidebarConflict'] });
    expect(
      validatePageConfig({ zones: { main: [], sidebar: null }, themeId: null, showSidebar: true })
        .showSidebar,
    ).toBe(true);
    // Brouillon d'avant la sidebar commune : elle n'est pas affichée.
    expect(
      validatePageConfig({ zones: { main: [], sidebar: [] }, themeId: null }).showSidebar,
    ).toBe(false);
  });

  it('refuse une répartition de colonnes inconnue et des id en double', () => {
    const { status, body } = errorOf(() =>
      validatePageConfig({
        zones: {
          main: [
            { id: id(1), columns: [{ width: '1/2', block: image(2) }] },
            { id: id(1), columns: [{ width: '1/1', block: image(2) }] },
          ],
          sidebar: null,
        },
      }),
    );
    expect(status).toBe(400);
    expect(body.details.fields).toMatchObject({
      'config.zones.main[0].columns': ['rowLayout'],
      'config.zones.main[1].id': ['duplicateId'],
      'config.zones.main[1].columns[0].block.id': ['duplicateId'],
    });
  });

  it('valide la config de chaque module avec son schéma, champs inconnus refusés', () => {
    const bad = {
      ...image(2),
      config: { mediaId: 'x', alt: 'a', size: 'huge', align: 'center', x: 1 },
    };
    const { body } = errorOf(() =>
      validatePageConfig({
        zones: { main: [{ id: id(1), columns: [{ width: '1/1', block: bad }] }], sidebar: null },
      }),
    );
    const prefix = 'config.zones.main[0].columns[0].block.config';
    expect(body.details.fields).toMatchObject({
      [`${prefix}.mediaId`]: ['isUuid'],
      [`${prefix}.size`]: ['isIn'],
      [`${prefix}.x`]: ['whitelistValidation'],
    });
  });

  it('refuse un type de module inconnu (dont la carte cliquable retirée)', () => {
    const map = { id: id(2), type: 'clickable_map', config: {} };
    const { body } = errorOf(() =>
      validatePageConfig({
        zones: { main: [{ id: id(1), columns: [{ width: '1/1', block: map }] }], sidebar: null },
      }),
    );
    expect(body.details.fields).toEqual({
      'config.zones.main[0].columns[0].block.type': ['isIn'],
    });
  });

  it('refuse une colonne de tableau hors de la plage', () => {
    const table = {
      id: id(2),
      type: 'table',
      config: {
        sourceId: id(9),
        sheet: 'Stock',
        range: { mode: 'extensible', columns: 'A:C', startRow: 1 },
        headerRow: true,
        columns: [
          { col: 'B', visible: true, label: '', format: 'text' },
          { col: 'E', visible: true, label: '', format: 'text' },
        ],
        pageSize: 25,
        sortable: true,
        searchable: true,
      },
    };
    const { body } = errorOf(() =>
      validatePageConfig({
        zones: { main: [{ id: id(1), columns: [{ width: '1/1', block: table }] }], sidebar: null },
      }),
    );
    expect(body.details.fields).toEqual({
      'config.zones.main[0].columns[0].block.config.columns[1].col': ['outOfRange'],
    });
  });

  it('nettoie le HTML du contenu libre', () => {
    const rich = {
      id: id(2),
      type: 'rich_content',
      config: { html: '<p>ok</p><script>x</script>' },
    };
    const config = validatePageConfig({
      zones: { main: [{ id: id(1), columns: [{ width: '1/1', block: rich }] }], sidebar: null },
    });
    expect(config.zones.main![0]!.columns[0]!.block!.config).toEqual({ html: '<p>ok</p>' });
  });
});

describe('validateLayoutConfig', () => {
  it('refuse formulaires, espaces et chats → 422 BLOCK_NOT_ALLOWED_IN_LAYOUT', () => {
    for (const type of ['form', 'discussion_space', 'chat']) {
      const { status, body } = errorOf(() =>
        validateLayoutConfig({
          rows: [
            { id: id(1), columns: [{ width: '1/1', block: { id: id(2), type, config: {} } }] },
          ],
        }),
      );
      expect(status).toBe(422);
      expect(body).toMatchObject({
        code: 'BLOCK_NOT_ALLOWED_IN_LAYOUT',
        details: { blockIds: [id(2)] },
      });
    }
  });
});
