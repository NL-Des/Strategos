import type { FormMode, SubmissionStatus } from '../enums.js';
import type { ErrorCode, Warning } from '../errors.js';
import type {
  AutoField,
  FieldType,
  FormDefinition,
  SubmissionValue,
  SubmissionValues,
} from './definition.js';

// Échanges des formulaires et des soumissions (13 — Schémas clés).

/** `closed` : fermé par l'admin ou date limite passée ; `full` : zone d'ajout pleine. */
export type FormState = 'open' | 'closed' | 'full';

/** Champ côté utilisateur : ni cellule, ni colonne, ni source. */
export interface UserFormField {
  key: string;
  label: string;
  help: string;
  type: FieldType;
  required: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  minDate?: string;
  maxDate?: string;
  /** Liste déroulante : options résolues. */
  options?: string[];
  auto?: AutoField;
  readOnly?: true;
  /** Champ automatique : valeur qui sera enregistrée. */
  value?: string;
  movement?: true;
}

/** `GET /forms/:id`. */
export interface UserForm {
  id: string;
  mode: FormMode;
  state: FormState;
  closesAt: string | null;
  title: string;
  intro: string;
  successMessage: string;
  fields: UserFormField[];
}

/** `POST /forms/:id/submissions`. */
export interface SubmitFormInput {
  values: SubmissionValues;
  /** Formulaire de ligne : valeur de la clé de la ligne visée. */
  rowKey?: string;
}

/** `GET /forms/:id/prefill?rowKey=` : valeurs actuelles de la ligne. */
export interface FormPrefill {
  values: SubmissionValues;
}

export interface Submission {
  id: string;
  formId: string;
  formTitle: string;
  status: SubmissionStatus;
  submittedAt: string;
  decidedAt: string | null;
  values: SubmissionValues;
  rowKey: string | null;
  reason: string | null;
}

/** Formulaire côté admin : brouillon, version publiée et réglages opérationnels. */
export interface AdminForm {
  id: string;
  pageId: string;
  blockId: string;
  mode: FormMode;
  draft: FormDefinition;
  published: FormDefinition | null;
  publishedVersion: number | null;
  isOpen: boolean;
  closesAt: string | null;
  autoValidate: boolean;
  /** Le brouillon a un mapping complet. */
  configured: boolean;
  version: number;
}

/** Réponse de `PUT /admin/forms/:id/draft`. */
export interface SaveFormDraftResult {
  form: AdminForm;
  warnings: Warning[];
  /** Soumissions en attente qui seraient invalidées à la publication. */
  wouldInvalidate: number;
}

export interface FormSettingsInput {
  closesAt?: string | null;
  autoValidate?: boolean;
  confirm?: boolean;
}

/** Cellule réellement écrite par une validation (journal, réimport). */
export interface WrittenCell {
  /** Clé du champ qui a produit l'écriture. */
  field: string;
  sourceId: string;
  sheet: string;
  row: number;
  col: number;
  before: string | null;
  after: string | null;
  /** Champ « mouvement » : quantité appliquée. */
  movement?: number;
}

/** Cellule visée par une soumission, dans la file de l'admin. */
export interface SubmissionTarget {
  field: string;
  sourceId: string;
  sheet: string;
  /** « D138 » ; `null` si la ligne n'est pas encore connue (ajout) ou introuvable. */
  cell: string | null;
  currentValue: string | null;
  proposed: SubmissionValue;
  movement: boolean;
  /** La cible n'a pas pu être résolue (clé introuvable, source injoignable…). */
  error?: ErrorCode;
}

/** Élément de `GET /admin/submissions`. */
export interface SubmissionQueueItem {
  submission: Submission;
  user: { id: string; username: string };
  form: { id: string; title: string; mode: FormMode; pageId: string };
  targets: SubmissionTarget[];
  /** Autres soumissions en attente sur les mêmes cellules. */
  conflicts: string[];
  warnings: Warning[];
}

export interface ModifySubmissionInput {
  values: SubmissionValues;
  confirm?: boolean;
}

/** `GET /admin/pages/:id/publish/preview`. */
export interface PublishPreview {
  forms: {
    id: string;
    title: string;
    change: 'created' | 'updated' | 'structural' | 'deleted';
  }[];
  invalidatedSubmissions: number;
  /** Espaces de discussion créés ou retirés par la publication (07). */
  spaces: {
    name: string;
    change: 'created' | 'deleted';
  }[];
}

/** Validation qu'un réimport ferait perdre. */
export interface LostValidation {
  submissionId: string;
  /** « Stock!C2 ». */
  cell: string;
  validatedValue: string | null;
  valueInNewFile: string | null;
  validatedAt: string;
}

/** `POST /admin/sources/:id/reimport/preview`. */
export interface ReimportPreview {
  reimportToken: string;
  expiresAt: string;
  lastDownloadedAt: string | null;
  lostValidations: LostValidation[];
}

export const REIMPORT_MODES = ['overwrite', 'reapply'] as const;
export type ReimportMode = (typeof REIMPORT_MODES)[number];
