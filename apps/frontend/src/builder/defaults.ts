import type { AvailableBlockType, Block, Row } from '@strategos/shared';

export const newId = () => crypto.randomUUID();

/** Configuration d'un module juste ajouté ; l'admin la complète avant d'enregistrer. */
export function newBlock(type: AvailableBlockType): Block {
  switch (type) {
    case 'image':
      return { id: newId(), type, config: { mediaId: '', alt: '', size: 'fit', align: 'center' } };
    case 'buttons':
      return {
        id: newId(),
        type,
        config: {
          buttons: [{ id: newId(), label: '', target: { kind: 'page', pageId: '' } }],
          orientation: 'horizontal',
          align: 'left',
        },
      };
    case 'rich_content':
      return { id: newId(), type, config: { html: '<p></p>' } };
    case 'table':
      return {
        id: newId(),
        type,
        config: {
          sourceId: null,
          sheet: null,
          range: { mode: 'extensible', columns: 'A:C', startRow: 1 },
          headerRow: true,
          columns: ['A', 'B', 'C'].map((col) => ({
            col,
            visible: true,
            label: '',
            format: 'text',
          })),
          pageSize: 25,
          sortable: true,
          searchable: true,
        },
      };
    case 'catalog':
      return {
        id: newId(),
        type,
        config: {
          sourceId: null,
          sheet: null,
          range: { mode: 'extensible', columns: 'A:D', startRow: 1 },
          headerRow: true,
          layout: 'image_top',
          imageCol: 'A',
          titleCol: 'B',
          details: [],
          perRow: 3,
          pageSize: 25,
          searchable: true,
        },
      };
    case 'form':
      // Le formulaire est créé côté serveur quand l'admin choisit son type.
      return { id: newId(), type, config: { formId: '' } };
    case 'discussion_space':
      // L'espace est créé côté serveur à la publication de la page.
      return { id: newId(), type, config: { name: '', sortMode: 'activity' } };
    case 'chat':
      // Le chat est créé côté serveur à la publication de la page.
      return { id: newId(), type, config: { name: '', height: 400 } };
  }
}

export function newRow(): Row {
  return { id: newId(), columns: [{ width: '1/1', block: null }] };
}
