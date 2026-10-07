import type { BlockType, BlockConfigs } from './blocks.js';

/**
 * Structure d'une zone (06 — Points techniques) : une pile de rangées de 1 à 3
 * colonnes, chaque colonne accueillant au plus un module. Les `id` sont des UUID
 * générés à la création et stables d'une publication à l'autre.
 */
export const ROW_LAYOUTS = [
  ['1/1'],
  ['1/2', '1/2'],
  ['1/3', '2/3'],
  ['2/3', '1/3'],
  ['1/3', '1/3', '1/3'],
] as const;
export type ColumnWidth = '1/1' | '1/2' | '1/3' | '2/3';

export type Block = {
  [K in BlockType]: { id: string; type: K; config: BlockConfigs[K] };
}[BlockType];

export interface Column {
  width: ColumnWidth;
  block: Block | null;
}

export interface Row {
  id: string;
  columns: Column[];
}

/** Zones propres à une page ; `null` = zone absente. */
export interface PageZones {
  main: Row[] | null;
  sidebar: Row[] | null;
}

/**
 * Brouillon ou version publiée d'une page. Le thème et l'affichage du header, du
 * footer et de la sidebar commune en font partie : ils ne changent pour les
 * utilisateurs qu'à la publication.
 */
export interface PageConfig {
  zones: PageZones;
  themeId: string | null;
  showHeader: boolean;
  showFooter: boolean;
  /** Sidebar commune affichée ; exclut une sidebar propre à la page (`zones.sidebar`). */
  showSidebar: boolean;
}

/** Brouillon ou version publiée du header, du footer ou de la sidebar commune. */
export interface LayoutConfig {
  rows: Row[];
}

export const EMPTY_PAGE_CONFIG: PageConfig = {
  zones: { main: [], sidebar: null },
  themeId: null,
  showHeader: true,
  showFooter: true,
  showSidebar: false,
};

export const EMPTY_LAYOUT_CONFIG: LayoutConfig = { rows: [] };

/** Zone partagée vue comme une page à une seule zone, pour les calculs communs. */
export const layoutAsPage = (config: LayoutConfig): PageConfig => ({
  ...EMPTY_PAGE_CONFIG,
  zones: { main: config.rows ?? [], sidebar: null },
});
