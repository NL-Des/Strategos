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
  /** `false` : lecture seule (Google Sheet par lien public), aucun formulaire ne peut y écrire. */
  writable: boolean;
  /** Google Sheet relié par un script : le script déployé est plus ancien que celui de Strategos. */
  scriptOutdated: boolean;
  version: number;
}

/**
 * `POST /admin/sources` : un Google Sheet choisi dans le sélecteur de fichiers
 * Google, un fichier du OneDrive connecté, un Google Sheet partagé par lien
 * public (`url` : son lien ; `confirm` après l'avertissement `SOURCE_PUBLIC_LINK`),
 * ou un Google Sheet relié par un script (`scriptUrl` : adresse du déploiement ;
 * `secret` : celui du script préparé par `POST /admin/sources/script`).
 */
export type AddSourceInput =
  | { type: 'gsheet'; spreadsheetId: string }
  | { type: 'onedrive'; itemId: string }
  | { type: 'gsheet_link'; url: string; confirm?: boolean }
  | { type: 'gsheet_script'; scriptUrl: string; secret: string };

/** Adresse d'une application web Apps Script (compte personnel ou domaine Workspace). */
export const SCRIPT_URL_PATTERN =
  /^https:\/\/script\.google\.com\/(?:a\/macros\/[a-z0-9.-]+|macros)\/s\/[A-Za-z0-9_-]{20,200}\/exec$/;
/** Secret d'un script : 32 octets en base64url. */
export const SCRIPT_SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Script Apps Script à coller dans le Sheet (`POST /admin/sources/script`,
 * `GET /admin/sources/:id/script`). Il contient son secret.
 */
export interface SourceScript {
  script: string;
  /** À renvoyer à l'ajout de la source ; absent pour une source déjà reliée. */
  secret?: string;
}

export const SPREADSHEET_ID_PATTERN = /^[A-Za-z0-9_-]{20,200}$/;
export const SOURCE_URL_MAX_LENGTH = 500;

/**
 * Identifiant d'un Google Sheet, tiré de son lien de partage
 * (`https://docs.google.com/spreadsheets/d/<id>/edit…`) ; `null` si ce n'en est pas un.
 */
export function spreadsheetIdFromUrl(url: string): string | null {
  const id = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]+)(?:[/?#]|$)/.exec(
    url.trim(),
  )?.[1];
  // Un lien « Publier sur le Web » (`/d/e/…`) ne désigne pas le document lui-même.
  return id && SPREADSHEET_ID_PATTERN.test(id) ? id : null;
}

/** Connexion du compte Google de l'admin (accès délégué, limité aux fichiers qu'il choisit). */
export interface GoogleStatus {
  /** Les identifiants du projet Google Cloud sont en place. */
  configured: boolean;
  /** Ils sont fournis au déploiement : non modifiables depuis l'écran Sources. */
  managed: boolean;
  /** Identifiant du client OAuth ; le secret n'est jamais renvoyé. */
  clientId: string | null;
  hasApiKey: boolean;
  /** Adresse de retour à déclarer dans le client OAuth, chez Google. */
  redirectUri: string;
  connected: boolean;
  accountLabel: string | null;
  /** La connexion a expiré : l'admin doit se reconnecter. */
  expired: boolean;
}

export const GOOGLE_CLIENT_ID_PATTERN = /^\d+-[a-z0-9-]+\.apps\.googleusercontent\.com$/;
export const GOOGLE_SECRET_MAX_LENGTH = 200;

/**
 * `PUT /admin/google/config` : identifiants du projet Google Cloud, copiés par
 * l'admin depuis la console Google. La clé d'API sert au sélecteur de fichiers.
 */
export interface GoogleConfigInput {
  clientId: string;
  clientSecret: string;
  apiKey?: string;
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

/**
 * Sources que l'admin voit et modifie dans la grille (04 — Sources) : un Excel
 * uploadé, ou un Google Sheet du compte connecté ou relié par un script.
 */
export const sourceHasGrid = (type: SourceType): boolean =>
  type === 'upload' || type === 'gsheet' || type === 'gsheet_script';

/** Fenêtre maximale de la grille (`GET /admin/sources/:id/cells`). */
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
 * Fenêtre de la grille d'un Excel uploadé ou d'un Google Sheet (compte
 * connecté ou script), réservée à l'admin (04 — Sources).
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
 * si la cellule a changé depuis (une validation, une modification dans
 * Google Sheets), `409 EDIT_CONFLICT`.
 */
export interface CellEditInput {
  sheet: string;
  row: number;
  col: number;
  expected: { display: string; formula: string | null };
  /** Saisie comme dans Excel : `=…` pour une formule (voir `parseCellInput`). */
  input: string;
}
