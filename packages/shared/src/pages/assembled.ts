import type { Alignment } from './blocks.js';
import type { ResolvedLink } from './links.js';
import type { ColumnWidth } from './structure.js';
import type { ThemeConfig } from './themes.js';

// Page assemblée (13 — Page assemblée) : ce que reçoit le frontend, déjà filtré.
// Modules non configurés et liens vers des pages illisibles en sont absents.

export interface AssembledImageBlock {
  id: string;
  type: 'image';
  config: {
    src: string;
    alt: string;
    size: 'fit' | 'original';
    align: Alignment;
    link: ResolvedLink | null;
  };
}

export interface AssembledButtonsBlock {
  id: string;
  type: 'buttons';
  config: {
    buttons: { id: string; label: string; link: ResolvedLink }[];
    orientation: 'horizontal' | 'vertical';
    align: Alignment;
  };
}

export interface AssembledRichContentBlock {
  id: string;
  type: 'rich_content';
  config: { html: string };
}

export type AssembledBlock =
  AssembledImageBlock | AssembledButtonsBlock | AssembledRichContentBlock;

export interface AssembledColumn {
  width: ColumnWidth;
  block: AssembledBlock | null;
}

export interface AssembledRow {
  id: string;
  columns: AssembledColumn[];
}

export interface AssembledPage {
  id: string;
  name: string;
  publishedAt: string | null;
  theme: { id: string; config: ThemeConfig };
  showHeader: boolean;
  showFooter: boolean;
  zones: { main: AssembledRow[] | null; sidebar: AssembledRow[] | null };
  unavailableSources: string[];
}

/** Header et footer partagés publiés (`GET /layout`) ; `null` s'ils ne l'ont jamais été. */
export interface AssembledLayout {
  header: AssembledRow[] | null;
  footer: AssembledRow[] | null;
}
