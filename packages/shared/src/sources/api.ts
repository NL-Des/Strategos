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

/**
 * `POST /admin/sources` : un Google Sheet choisi dans le sélecteur de fichiers
 * Google, ou un fichier du OneDrive connecté.
 */
export type AddSourceInput =
  { type: 'gsheet'; spreadsheetId: string } | { type: 'onedrive'; itemId: string };

/** Connexion du compte Google de l'admin (accès délégué, limité aux fichiers qu'il choisit). */
export interface GoogleStatus {
  /** Le client OAuth Google est configuré au déploiement. */
  configured: boolean;
  connected: boolean;
  accountLabel: string | null;
  /** La connexion a expiré : l'admin doit se reconnecter. */
  expired: boolean;
}

/**
 * `GET /admin/google/picker` : ce qu'il faut au sélecteur de fichiers Google,
 * ouvert dans le navigateur de l'admin. Le jeton est court et ne donne accès
 * qu'aux fichiers déjà choisis.
 */
export interface GooglePickerSession {
  accessToken: string;
  /** Clé d'API du projet Google Cloud ; `null` si elle n'est pas fournie. */
  apiKey: string | null;
  /** Numéro du projet Google Cloud. */
  appId: string;
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

/**
 * `PATCH /admin/sources/:id/cells` : modification d'une cellule par l'admin.
 * `expected` est ce que l'admin voyait (`display`, `formula` de la grille) :
 * si la cellule a changé depuis (une validation), `409 EDIT_CONFLICT`.
 */
export interface CellEditInput {
  sheet: string;
  row: number;
  col: number;
  expected: { display: string; formula: string | null };
  /** Saisie comme dans Excel : `=…` pour une formule (voir `parseCellInput`). */
  input: string;
}
