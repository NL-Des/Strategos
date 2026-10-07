import type { FormDefinition, PageConfig } from '@strategos/shared';
import { stripRichCells } from '../pages/rich-cells.js';
import { copyPageConfig, resetFormDefinition, resetPageConfig } from './template-reset.js';

const SOURCE = '0190f5c0-0000-7000-8000-000000000001';

const base: FormDefinition = {
  title: 'Stock',
  intro: '',
  successMessage: '',
  sourceId: SOURCE,
  sheet: 'Stock',
  fields: [{ key: 'qte', label: 'Quantité', help: '', type: 'number', required: true, col: 'C' }],
};

describe('réinitialisation des modèles', () => {
  it('formulaire de ligne : source, plage, clé et bloc relié vidés', () => {
    const def = resetFormDefinition('ligne', {
      ...base,
      rowStart: 2,
      rowEnd: 40,
      keyCol: 'A',
      linkedBlockId: SOURCE,
    });
    expect(def).toEqual({
      title: 'Stock',
      intro: '',
      successMessage: '',
      sourceId: null,
      sheet: null,
      rowEnd: null,
      fields: [{ key: 'qte', label: 'Quantité', help: '', type: 'number', required: true }],
    });
  });

  it('formulaire de modification : cellules et feuille vidées, source gardée', () => {
    const def = resetFormDefinition('modification', {
      ...base,
      fields: [{ ...base.fields[0]!, col: undefined, cell: 'C2', movement: true }],
    });
    expect(def.sourceId).toBe(SOURCE);
    expect(def.sheet).toBeNull();
    expect(def.fields[0]).not.toHaveProperty('cell');
    expect(def.fields[0]!.movement).toBe(true);
  });

  it('valeurs insérées retirées du Contenu libre, repère gardé', () => {
    const html = `<p>Or : <span data-cell-source="${SOURCE}" data-cell-sheet="Arkan" data-cell-ref="D2" data-cell-format="number">{Arkan!D2}</span> po</p>`;
    expect(stripRichCells(html)).toBe('<p>Or : {D2} po</p>');
  });

  it('page : plages vidées, autres modules intacts ; copie avec de nouveaux ids', () => {
    const config: PageConfig = {
      zones: {
        main: [
          {
            id: 'r1',
            columns: [
              {
                width: '1/1',
                block: {
                  id: 'b1',
                  type: 'catalog',
                  config: {
                    sourceId: SOURCE,
                    sheet: 'Stock',
                    range: { mode: 'fixed', ref: 'A1:D9' },
                    headerRow: true,
                    layout: 'image_top',
                    details: [],
                    perRow: 3,
                    pageSize: 25,
                    searchable: false,
                  },
                },
              },
            ],
          },
        ],
        sidebar: [
          {
            id: 'r2',
            columns: [
              {
                width: '1/1',
                block: { id: 'b2', type: 'chat', config: { name: 'Salon', height: 300 } },
              },
            ],
          },
        ],
      },
      themeId: null,
      showHeader: true,
      showFooter: true,
      showSidebar: false,
    };
    const reset = resetPageConfig(config);
    expect(reset.zones.main![0]!.columns[0]!.block!.config).toMatchObject({
      sourceId: null,
      sheet: null,
      range: null,
      layout: 'image_top',
    });
    expect(reset.zones.sidebar).toEqual(config.zones.sidebar);

    let n = 0;
    const copy = copyPageConfig(reset, () => `id-${++n}`);
    expect(copy.zones.main![0]!.id).toBe('id-1');
    expect(copy.zones.main![0]!.columns[0]!.block!.id).toBe('id-2');
    expect(copy.zones.sidebar![0]!.columns[0]!.block!.id).toBe('id-4');
  });
});
