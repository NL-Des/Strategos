import type { Row } from '@strategos/shared';
import { EMPTY_CELL } from '../sources/cell-format.js';
import { assembleRows, type ReaderContext } from './assembler.js';

const readable = 'page-lisible';
const ctx = (personalPageId: string | null = null): ReaderContext => ({
  personalPageId,
  canReadPage: (id) => id === readable || id === 'perso',
  mediaExists: (id) => id === 'img',
  cell: () => EMPTY_CELL,
  sourceAvailable: () => true,
  rowsUrl: (id) => `/api/v1/blocks/${id}/rows`,
});

const row = (block: Row['columns'][number]['block']): Row[] => [
  { id: 'r', columns: [{ width: '1/1', block }] },
];

describe('assemblage', () => {
  it('retire les boutons vers une page illisible, garde les liens externes', () => {
    const [assembled] = assembleRows(
      row({
        id: 'b',
        type: 'buttons',
        config: {
          orientation: 'horizontal',
          align: 'left',
          buttons: [
            { id: '1', label: 'Ok', target: { kind: 'page', pageId: readable } },
            { id: '2', label: 'Caché', target: { kind: 'page', pageId: 'secret' } },
            { id: '3', label: 'Web', target: { kind: 'url', url: 'https://ex.org' } },
          ],
        },
      }),
      ctx(),
    );
    const block = assembled!.columns[0]!.block;
    expect(block?.type === 'buttons' && block.config.buttons.map((b) => b.label)).toEqual([
      'Ok',
      'Web',
    ]);
  });

  it('résout « Ma page personnelle », ou la retire sans page personnelle', () => {
    const buttons = row({
      id: 'b',
      type: 'buttons',
      config: {
        orientation: 'horizontal',
        align: 'left',
        buttons: [{ id: '1', label: 'Mon espace', target: { kind: 'personal_page' } }],
      },
    });
    const withPage = assembleRows(buttons, ctx('perso'))[0]!.columns[0]!.block;
    expect(withPage?.type === 'buttons' && withPage.config.buttons[0]!.link).toEqual({
      kind: 'page',
      pageId: 'perso',
    });
    expect(assembleRows(buttons, ctx(null))[0]!.columns[0]!.block).toBeNull();
  });

  it('garde une image vers une page illisible, sans lien ; retire une image supprimée', () => {
    const image = (mediaId: string) =>
      row({
        id: 'i',
        type: 'image',
        config: {
          mediaId,
          alt: '',
          size: 'fit',
          align: 'left',
          link: { kind: 'page', pageId: 'secret' },
        },
      });
    const block = assembleRows(image('img'), ctx())[0]!.columns[0]!.block;
    expect(block).toMatchObject({
      type: 'image',
      config: { src: '/api/v1/media/img', link: null },
    });
    expect(assembleRows(image('supprimee'), ctx())[0]!.columns[0]!.block).toBeNull();
  });
});
