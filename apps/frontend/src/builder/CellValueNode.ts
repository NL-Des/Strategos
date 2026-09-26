import { mergeAttributes, Node } from '@tiptap/core';

export interface CellValueAttrs {
  source: string;
  sheet: string;
  ref: string;
  format: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    cellValue: {
      insertCellValue: (attrs: CellValueAttrs) => ReturnType;
    };
  }
}

/**
 * Valeur de cellule insérée dans un Contenu libre (06) : un élément atomique
 * affiché `{Feuille!B2}` dans l'éditeur. Le backend le résout à chaque affichage.
 */
export const CellValue = Node.create({
  name: 'cellValue',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    const attr = (name: string) => ({
      default: '',
      parseHTML: (el: HTMLElement) => el.getAttribute(`data-cell-${name}`) ?? '',
      renderHTML: (attrs: Record<string, string>) => ({ [`data-cell-${name}`]: attrs[name] }),
    });
    return {
      source: attr('source'),
      sheet: attr('sheet'),
      ref: attr('ref'),
      format: attr('format'),
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-cell-ref]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { sheet, ref } = node.attrs as CellValueAttrs;
    return [
      'span',
      mergeAttributes(HTMLAttributes, { class: 'cell-value-tag' }),
      `{${sheet}!${ref}}`,
    ];
  },

  addCommands() {
    return {
      insertCellValue:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});
