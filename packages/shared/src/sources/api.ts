import type { SourceStatus, SourceType } from '../enums.js';

/** Sources de données (08, 13 — routes Sources) : réservé à l'admin. */

export const EXCEL_MAX_BYTES = 20 * 1024 * 1024;
export const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export interface SourceUsages {
  pages: { id: string; name: string }[];
  layouts: string[];
}

/** Ligne de l'écran Sources (`GET /admin/sources`). */
export interface SourceSummary {
  id: string;
  type: SourceType;
  name: string;
  status: SourceStatus;
  lastReadAt: string | null;
  lastImportedAt: string | null;
  lastDownloadedAt: string | null;
  createdAt: string;
  /** Feuilles, pour les sélecteurs du page builder. */
  sheets: string[];
  usages: SourceUsages;
  version: number;
}
