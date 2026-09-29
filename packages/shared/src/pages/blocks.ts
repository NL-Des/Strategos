import type { TopicSort } from '../enums.js';
import type { LinkTarget } from './links.js';

/** Types de modules (06 — Registre des modules). */
export const BLOCK_TYPES = [
  'image',
  'buttons',
  'clickable_map',
  'table',
  'catalog',
  'rich_content',
  'form',
  'discussion_space',
  'chat',
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

/** Modules refusés dans le header et le footer partagés (`422 BLOCK_NOT_ALLOWED_IN_LAYOUT`). */
export const LAYOUT_FORBIDDEN_BLOCK_TYPES: readonly BlockType[] = [
  'form',
  'discussion_space',
  'chat',
];

export const ALIGNMENTS = ['left', 'center', 'right'] as const;
export type Alignment = (typeof ALIGNMENTS)[number];

// Configuration de chaque module. Les schémas de validation correspondants sont
// dans `@strategos/shared/validation` (backend) et implémentent ces interfaces.
// Chaque étape ajoute les modules qu'elle livre.

/** Image de la médiathèque, avec un lien facultatif (06 — Image). */
export interface ImageBlockConfig {
  mediaId: string;
  alt: string;
  /** `fit` : largeur de la colonne ; `original` : taille d'origine. */
  size: 'fit' | 'original';
  align: Alignment;
  link?: LinkTarget;
}

export interface ButtonItem {
  id: string;
  label: string;
  target: LinkTarget;
}

/** Barre de boutons (06 — Boutons). */
export interface ButtonsBlockConfig {
  buttons: ButtonItem[];
  orientation: 'horizontal' | 'vertical';
  align: Alignment;
}

/**
 * Texte mis en forme (06 — Contenu libre). Le HTML est nettoyé par le backend
 * (liste blanche) avant d'être enregistré. Une valeur de cellule insérée est un
 * `<span>` portant `data-cell-source`, `data-cell-sheet`, `data-cell-ref` et
 * `data-cell-format`, résolu par le backend à chaque affichage.
 */
export interface RichContentBlockConfig {
  html: string;
}

/** Formats d'affichage d'une valeur de cellule (06 — Tableau). */
export const CELL_FORMATS = ['text', 'number', 'date', 'currency', 'image', 'link'] as const;
export type CellFormat = (typeof CELL_FORMATS)[number];

/** Formats d'une valeur insérée dans un Contenu libre. */
export const INLINE_CELL_FORMATS = ['text', 'number', 'date', 'currency'] as const;
export type InlineCellFormat = (typeof INLINE_CELL_FORMATS)[number];

/**
 * Plage d'un Tableau ou d'un Catalogue (06 — Plage des tableaux) : fixe
 * (`ref` = « A1:D11 ») ou extensible (`columns` = « A:D » à partir de
 * `startRow`, jusqu'à la dernière ligne remplie).
 */
export interface DataRange {
  mode: 'fixed' | 'extensible';
  ref?: string;
  columns?: string;
  startRow?: number;
}

/**
 * Données lues par un module : la source, la feuille et la plage. Vides
 * (`null`) sur un module non configuré, par exemple juste après l'instanciation
 * d'un modèle de page (10) : il est alors masqué aux utilisateurs.
 */
export interface DataSourceRef {
  sourceId: string | null;
  sheet: string | null;
  range: DataRange | null;
  /** La première ligne de la plage sert d'en-têtes (elle n'est pas affichée comme donnée). */
  headerRow: boolean;
}

/** Module de données dont la source, la feuille et la plage sont choisies. */
export type ConfiguredDataSourceRef = Omit<DataSourceRef, 'sourceId' | 'sheet' | 'range'> & {
  sourceId: string;
  sheet: string;
  range: DataRange;
};

export function isDataConfigured<R extends DataSourceRef>(
  ref: R,
): ref is R & ConfiguredDataSourceRef {
  return !!ref.sourceId && !!ref.sheet && ref.range !== null;
}

export interface TableColumn {
  /** Colonne du document (« B »), dans la plage. */
  col: string;
  visible: boolean;
  /** Libellé affiché ; vide = en-tête du document, ou lettre de la colonne. */
  label: string;
  format: CellFormat;
}

export const TABLE_PAGE_SIZES = [10, 25, 50, 100, 200] as const;

/** Tableau (06 — Tableau). */
export interface TableBlockConfig extends DataSourceRef {
  columns: TableColumn[];
  pageSize: number;
  sortable: boolean;
  searchable: boolean;
}

export const CATALOG_LAYOUTS = [
  'image_top',
  'image_left',
  'image_right',
  'image_background',
] as const;
export type CatalogLayout = (typeof CATALOG_LAYOUTS)[number];

export interface CatalogDetail {
  col: string;
  label: string;
  format: CellFormat;
}

/** Catalogue (06 — Catalogue) : une carte par ligne. */
export interface CatalogBlockConfig extends DataSourceRef {
  layout: CatalogLayout;
  /** Colonne de l'image : nom d'un fichier de la médiathèque ou lien web. */
  imageCol?: string;
  titleCol?: string;
  subtitleCol?: string;
  details: CatalogDetail[];
  perRow: number;
  pageSize: number;
  searchable: boolean;
}

/**
 * Formulaire (06 — Formulaire, 09). Sa définition vit dans `forms`, créée par
 * `POST /admin/forms` à l'ajout du bloc ; elle suit le brouillon de la page.
 * Un formulaire de ligne n'est pas rendu seul : il s'ouvre depuis son Tableau
 * ou son Catalogue.
 */
export interface FormBlockConfig {
  formId: string;
}

/**
 * Espace de discussion (06 — Espace de discussion, 07). L'espace lui-même
 * (`discussion_spaces`) est créé à la publication de la page ; ses réglages
 * (nom, tri des sujets) suivent le brouillon. C'est une ressource du modèle de
 * droits : lecture, ouverture de sujets, publication de messages.
 */
export interface DiscussionSpaceBlockConfig {
  name: string;
  sortMode: TopicSort;
}

/**
 * Chat temps réel (06 — Chat, 07). Le chat lui-même (`chats`) est créé à la
 * publication de la page ; son nom suit le brouillon. Ce n'est pas une ressource
 * du modèle de droits : quiconque peut lire la page peut lire et écrire le chat.
 */
export interface ChatBlockConfig {
  name: string;
  /** Hauteur du module en pixels. */
  height: number;
}

export interface BlockConfigs {
  image: ImageBlockConfig;
  buttons: ButtonsBlockConfig;
  rich_content: RichContentBlockConfig;
  table: TableBlockConfig;
  catalog: CatalogBlockConfig;
  form: FormBlockConfig;
  discussion_space: DiscussionSpaceBlockConfig;
  chat: ChatBlockConfig;
}

export const DISCUSSION_SPACE_NAME_MAX_LENGTH = 100;
export const CHAT_NAME_MAX_LENGTH = 100;
export const CHAT_HEIGHT_MIN = 200;
export const CHAT_HEIGHT_MAX = 800;

export type AvailableBlockType = keyof BlockConfigs;

/** Modules disponibles ; un type absent est refusé à l'enregistrement. */
export const AVAILABLE_BLOCK_TYPES: readonly AvailableBlockType[] = [
  'image',
  'buttons',
  'rich_content',
  'table',
  'catalog',
  'form',
  'discussion_space',
  'chat',
];
