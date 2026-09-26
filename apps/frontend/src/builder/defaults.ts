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
  }
}

export function newRow(): Row {
  return { id: newId(), columns: [{ width: '1/1', block: null }] };
}
