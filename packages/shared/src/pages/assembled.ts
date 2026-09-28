import type { TopicSort } from '../enums.js';
import type { Alignment, CatalogLayout, CellFormat } from './blocks.js';
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

/** Valeur de cellule déjà formatée ; `needsRecalc` : à recalculer (Excel uploadé, 08). */
export interface CellValue {
  value: string;
  needsRecalc: boolean;
}

/** Erreur d'un module de données : sa source est injoignable, la page reste affichée. */
export type BlockError = 'SOURCE_UNAVAILABLE';

/**
 * Contenu libre : chaque valeur insérée est remplacée dans le HTML par
 * `<span data-value="i"></span>`, où `i` est son indice dans `values`.
 */
export interface AssembledRichContentBlock {
  id: string;
  type: 'rich_content';
  config: { html: string; values: CellValue[] };
  error?: BlockError;
}

/**
 * Formulaire de ligne relié à un Tableau ou un Catalogue : chaque ligne ou carte
 * porte sa clé (`rowKeys[formId]`) et affiche « Proposer une modification ».
 */
export interface RowFormLink extends FormLinks {
  formId: string;
  title: string;
}

/**
 * Adresses d'un formulaire : sa définition côté utilisateur (`formUrl`, suivie
 * de `/prefill?rowKey=` pour un formulaire de ligne) et l'envoi (`submitUrl`,
 * `null` en aperçu : le brouillon ne reçoit pas de soumissions).
 */
export interface FormLinks {
  formUrl: string;
  submitUrl: string | null;
}

/** Tableau : ni source, ni feuille, ni plage ; les lignes se chargent par `rowsUrl`. */
export interface AssembledTableBlock {
  id: string;
  type: 'table';
  config: {
    columns: { label: string; format: CellFormat }[];
    pageSize: number;
    sortable: boolean;
    searchable: boolean;
  };
  rowsUrl: string;
  rowForms: RowFormLink[];
  error?: BlockError;
}

export interface AssembledCatalogBlock {
  id: string;
  type: 'catalog';
  config: {
    layout: CatalogLayout;
    hasImage: boolean;
    detailLabels: string[];
    perRow: number;
    pageSize: number;
    searchable: boolean;
  };
  rowsUrl: string;
  rowForms: RowFormLink[];
  error?: BlockError;
}

/**
 * Formulaire publié et configuré (hors formulaire de ligne) ; sa définition côté
 * utilisateur se lit par `GET /forms/:formId`.
 */
export interface AssembledFormBlock {
  id: string;
  type: 'form';
  config: FormLinks & { formId: string };
}

/**
 * Espace de discussion visible par le lecteur (07). Absent du JSON si le lecteur
 * ne peut pas le lire. Les sujets et messages se chargent par `topicsUrl` ;
 * `canCreateTopic` et `canPost` reflètent les droits du lecteur sur l'espace.
 */
export interface AssembledDiscussionSpaceBlock {
  id: string;
  type: 'discussion_space';
  config: {
    name: string;
    sortMode: TopicSort;
    canCreateTopic: boolean;
    canPost: boolean;
  };
  topicsUrl: string;
}

export type AssembledBlock =
  | AssembledImageBlock
  | AssembledButtonsBlock
  | AssembledRichContentBlock
  | AssembledTableBlock
  | AssembledCatalogBlock
  | AssembledFormBlock
  | AssembledDiscussionSpaceBlock;

/** Cellule d'une ligne de Tableau ou d'une carte, déjà formatée. */
export interface RowCell extends CellValue {
  /** Format `link` : adresse web. */
  href?: string;
  /** Format `image` : adresse de l'image, ou `null` si introuvable (image par défaut). */
  image?: string | null;
}

/** Ligne d'un Tableau (`GET /blocks/:blockId/rows`), colonnes dans l'ordre affiché. */
export interface TableRow {
  cells: RowCell[];
  /** Clé de la ligne pour chaque formulaire de ligne relié (`formId` → valeur). */
  rowKeys?: Record<string, string>;
}

/** Carte d'un Catalogue ; `image: null` = image par défaut. */
export interface CatalogCard {
  image: string | null;
  title: RowCell | null;
  subtitle: RowCell | null;
  details: RowCell[];
  rowKeys?: Record<string, string>;
}

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
  /** Sources injoignables : renseigné pour l'admin seul, vide pour les utilisateurs. */
  unavailableSources: { id: string; name: string }[];
}

/** Header et footer partagés publiés (`GET /layout`) ; `null` s'ils ne l'ont jamais été. */
export interface AssembledLayout {
  header: AssembledRow[] | null;
  footer: AssembledRow[] | null;
}
