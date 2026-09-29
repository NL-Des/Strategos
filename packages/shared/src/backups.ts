import type { BackupStatus } from './enums.js';

/** Sauvegarde de l'instance (11 — Sauvegardes ; `GET /admin/backups`). */
export interface BackupSummary {
  id: string;
  status: BackupStatus;
  /** Taille de l'archive, une fois terminée. */
  sizeBytes: number | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}
