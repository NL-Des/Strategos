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
 * (liste blanche) avant d'être enregistré. Les valeurs de cellules arrivent à l'étape 5.
 */
export interface RichContentBlockConfig {
  html: string;
}

export interface BlockConfigs {
  image: ImageBlockConfig;
  buttons: ButtonsBlockConfig;
  rich_content: RichContentBlockConfig;
}

export type AvailableBlockType = keyof BlockConfigs;

/** Modules disponibles ; un type absent est refusé à l'enregistrement. */
export const AVAILABLE_BLOCK_TYPES: readonly AvailableBlockType[] = [
  'image',
  'buttons',
  'rich_content',
];
