import type { FormMode } from '../enums.js';

/**
 * Définition d'un formulaire (09 — Formulaires ; 14 — `form_versions.definition`).
 * L'admin l'édite en brouillon (`forms.draft_definition`) ; elle est figée dans
 * `form_versions` à la publication de la page. Un brouillon peut être incomplet :
 * le formulaire reste alors « non configuré » et n'est pas affiché.
 */

export const FIELD_TYPES = ['text', 'textarea', 'number', 'date', 'checkbox', 'select'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

/** Champs remplis par Strategos, non modifiables par l'utilisateur. */
export const AUTO_FIELDS = ['pseudo', 'date'] as const;
export type AutoField = (typeof AUTO_FIELDS)[number];

/** Clé d'un champ : identifiant stable, utilisé dans les valeurs soumises. */
export const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const FORM_MAX_FIELDS = 40;
export const FORM_MAX_NEW_ROWS = 10_000;
export const FIELD_MAX_LENGTH = 5_000;
export const SELECT_MAX_OPTIONS = 500;

/**
 * Options d'une liste déroulante : saisies par l'admin (`list` : `values`) ou lues
 * dans une plage du document (`range` : `sourceId`, `sheet`, `range` « A2:A20 »).
 */
export interface FieldOptions {
  kind: 'list' | 'range';
  values?: string[];
  sourceId?: string;
  sheet?: string;
  range?: string;
}

export interface FormField {
  key: string;
  label: string;
  help: string;
  type: FieldType;
  required: boolean;
  /** Texte : longueur maximale. */
  maxLength?: number;
  /** Nombre : bornes. */
  min?: number;
  max?: number;
  /** Date (« 2026-09-28 ») : bornes. */
  minDate?: string;
  maxDate?: string;
  options?: FieldOptions;
  auto?: AutoField;
  /** Nombre : l'utilisateur saisit une quantité à ajouter ou retirer. */
  movement?: boolean;
  /** Formulaire de modification : cellule visée (« B2 »), dans la feuille du formulaire. */
  cell?: string;
  /** Formulaire de ligne ou d'ajout : colonne visée (« C »). */
  col?: string;
}

export interface FormDefinition {
  title: string;
  intro: string;
  successMessage: string;
  sourceId: string | null;
  sheet: string | null;
  fields: FormField[];
  /** Ligne : lignes où chercher la clé ; `rowEnd` vide = jusqu'à la dernière ligne remplie. */
  rowStart?: number;
  rowEnd?: number | null;
  /** Ligne : colonne clé, qui identifie chaque ligne de façon unique. */
  keyCol?: string;
  /** Ligne : Tableau ou Catalogue de la page qui ouvre ce formulaire. */
  linkedBlockId?: string;
  /** Ajout : zone `[startRow, startRow + maxNewRows - 1]`. */
  startRow?: number;
  maxNewRows?: number;
}

export function emptyFormDefinition(mode: FormMode): FormDefinition {
  return {
    title: '',
    intro: '',
    successMessage: '',
    sourceId: null,
    sheet: null,
    fields: [],
    ...(mode === 'ligne' ? { rowStart: 2, rowEnd: null } : {}),
    ...(mode === 'ajout' ? { startRow: 2, maxNewRows: 20 } : {}),
  };
}

/** Valeur d'un champ : texte, nombre, booléen (case), date « AAAA-MM-JJ », ou vide. */
export type SubmissionValue = string | number | boolean | null;
export type SubmissionValues = Record<string, SubmissionValue>;
