import type { CellType, SourceStatus, SourceType } from '../enums.js';

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

/** `POST /admin/sources` : un Google Sheet par son lien, ou un fichier du OneDrive connecté. */
export type AddSourceInput = { type: 'gsheet'; url: string } | { type: 'onedrive'; itemId: string };

/** Adresse du compte de service avec laquelle partager les Sheets ; `null` s'il n'est pas configuré. */
export interface ServiceAccountInfo {
  email: string | null;
}

/** Connexion OneDrive de l'admin (accès délégué). */
export interface OneDriveStatus {
  /** L'application Azure est configurée au déploiement. */
  configured: boolean;
  connected: boolean;
  accountLabel: string | null;
  /** La connexion a expiré : l'admin doit se reconnecter. */
  expired: boolean;
}

/** Élément du OneDrive connecté, pour choisir un fichier. */
export interface OneDriveItem {
  id: string;
  name: string;
  folder: boolean;
  /** Chemin à passer à `browse` pour ouvrir un dossier. */
  path: string;
}

/** Fenêtre maximale de la grille d'un Excel uploadé (`GET /admin/sources/:id/cells`). */
export const GRID_MAX_ROWS = 200;
export const GRID_MAX_COLS = 50;

/** Cellule non vide de la grille : valeur affichée, formule et marque « à recalculer ». */
export interface GridCell {
  row: number;
  col: number;
  type: CellType;
  display: string;
  formula: string | null;
  needsRecalc: boolean;
}

/**
 * Fenêtre de la grille d'un Excel uploadé, réservée à l'admin (04 — Sources).
 * `maxRow` / `maxCol` : dernière ligne et dernière colonne non vides de la feuille.
 */
export interface SourceGrid {
  sheets: string[];
  sheet: string;
  maxRow: number;
  maxCol: number;
  top: number;
  left: number;
  rows: number;
  cols: number;
  cells: GridCell[];
}
