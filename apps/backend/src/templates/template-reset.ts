import type {
  Block,
  FormDefinition,
  FormField,
  FormMode,
  PageConfig,
  Row,
} from '@strategos/shared';
import { stripRichCells } from '../pages/rich-cells.js';

// Réinitialisation des mappings et des plages (10 — Modèles et duplication) :
// un modèle ne garde que la structure, jamais ce qui désigne une cellule, une
// colonne, une feuille ou une plage. Appliquée à l'enregistrement du modèle.

/** Champ sans cible ; une liste lue dans le document redevient une liste vide. */
function resetField(field: FormField): FormField {
  const { cell: _cell, col: _col, options, ...rest } = field;
  if (!options) return rest;
  return { ...rest, options: options.kind === 'range' ? { kind: 'list', values: [] } : options };
}

/**
 * Formulaire : champs, libellés et types gardés ; cellules, colonnes et feuille
 * vidées. Ajout : ligne de départ et nombre maximum de lignes vidés. Ligne :
 * source, plage, colonne clé et Tableau ou Catalogue relié vidés.
 */
export function resetFormDefinition(mode: FormMode, def: FormDefinition): FormDefinition {
  const {
    rowStart: _rs,
    rowEnd: _re,
    keyCol: _k,
    linkedBlockId: _l,
    startRow: _s,
    maxNewRows: _m,
    ...rest
  } = def;
  return {
    ...rest,
    sourceId: mode === 'ligne' ? null : def.sourceId,
    sheet: null,
    fields: def.fields.map(resetField),
    ...(mode === 'ligne' ? { rowEnd: null } : {}),
  };
}

/**
 * Module d'une page : Tableau et Catalogue perdent source, feuille et plage ;
 * le Contenu libre perd ses valeurs insérées. Le reste est copié tel quel.
 */
function resetBlock(block: Block): Block {
  switch (block.type) {
    case 'table':
    case 'catalog':
      return {
        ...block,
        config: { ...block.config, sourceId: null, sheet: null, range: null },
      } as Block;
    case 'rich_content':
      return { ...block, config: { html: stripRichCells(block.config.html) } };
    default:
      return block;
  }
}

const resetRows = (rows: Row[] | null): Row[] | null =>
  rows &&
  rows.map((row) => ({
    ...row,
    columns: row.columns.map((c) => ({ ...c, block: c.block && resetBlock(c.block) })),
  }));

/** Structure d'une page, plages et valeurs insérées réinitialisées. */
export function resetPageConfig(config: PageConfig): PageConfig {
  return {
    ...config,
    zones: { main: resetRows(config.zones.main), sidebar: resetRows(config.zones.sidebar) },
  };
}

/** Blocs d'une structure de page, avec leur position. */
export function pageBlocks(config: PageConfig): Block[] {
  return [...(config.zones.main ?? []), ...(config.zones.sidebar ?? [])]
    .flatMap((row) => row.columns)
    .flatMap((column) => (column.block ? [column.block] : []));
}

/**
 * Copie indépendante : nouveaux identifiants de rangées et de blocs (les
 * espaces, chats et formulaires sont rattachés aux blocs par leur id).
 * `mapBlock` reçoit l'ancien et le nouvel id, et peut remplacer le bloc
 * (formulaire recréé) ou le retirer (`null`).
 */
export function copyPageConfig(
  config: PageConfig,
  newId: () => string,
  mapBlock: (block: Block, id: string) => Block | null = (block, id) => ({ ...block, id }),
): PageConfig {
  const copy = (rows: Row[] | null): Row[] | null =>
    rows &&
    rows.map((row) => ({
      id: newId(),
      columns: row.columns.map((c) => ({
        width: c.width,
        block: c.block && mapBlock(c.block, newId()),
      })),
    }));
  return {
    ...config,
    zones: { main: copy(config.zones.main), sidebar: copy(config.zones.sidebar) },
  };
}
