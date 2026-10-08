import type { ExternalImages, LayoutKind } from '../enums.js';
import type { Warning } from '../errors.js';
import type { LayoutConfig, PageConfig } from './structure.js';

/** Ligne de la liste des pages (admin), qui alimente aussi les sélecteurs de liens. */
export interface AdminPageSummary {
  id: string;
  name: string;
  publishedAt: string | null;
  /** Le brouillon diffère de la version publiée. */
  hasDraftChanges: boolean;
  updatedAt: string;
}

/** Page côté admin : brouillon, version publiée et verrou optimiste. */
export interface AdminPage {
  id: string;
  name: string;
  draft: PageConfig;
  published: PageConfig | null;
  publishedAt: string | null;
  updatedAt: string;
  version: number;
}

/** Réponse de `PUT /admin/pages/:id/draft` : avertissements non bloquants en plus. */
export interface SavePageDraftResult extends AdminPage {
  warnings: Warning[];
}

export interface AdminLayoutPart {
  kind: LayoutKind;
  draft: LayoutConfig;
  published: LayoutConfig | null;
  publishedAt: string | null;
  version: number;
}

/** Réponse de `PUT /admin/layout/:kind/draft` : avertissements non bloquants en plus. */
export interface SaveLayoutDraftResult extends AdminLayoutPart {
  warnings: Warning[];
}

export interface MediaItem {
  id: string;
  filename: string;
  mime: string;
  sizeBytes: number;
  alt: string | null;
  /** Adresse de l'image, lisible par tout utilisateur connecté. */
  url: string;
  createdAt: string;
}

export const MEDIA_MAX_BYTES = 10 * 1024 * 1024;
export const MEDIA_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

/** Réglages de l'instance (04 — Réglages de l'instance). */
export interface InstanceSettings {
  landingPageId: string | null;
  defaultThemeId: string;
  /** Thème de toutes les pages en mode sombre ; `null` : les pages gardent leur thème. */
  darkThemeId: string | null;
  backupRetentionDays: number;
  /**
   * Images des catalogues désignées par un lien web : un lien externe révèle à son
   * hébergeur l'adresse de chaque lecteur. `allowlist` : seulement vers
   * `externalImageDomains` (et leurs sous-domaines) ; `none` : médiathèque seule.
   */
  externalImages: ExternalImages;
  externalImageDomains: string[];
  version: number;
}
