import type { LayoutKind } from '../enums.js';
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

export interface AdminLayoutPart {
  kind: LayoutKind;
  draft: LayoutConfig;
  published: LayoutConfig | null;
  publishedAt: string | null;
  version: number;
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
  backupRetentionDays: number;
  version: number;
}
