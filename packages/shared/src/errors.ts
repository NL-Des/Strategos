/**
 * Codes d'erreur stables renvoyés par l'API ; ils servent de clés de traduction
 * au frontend (`errors.<CODE>` dans le fichier `fr`). Voir 13 — Codes de retour et erreurs.
 * Chaque étape ajoute ici les codes de son domaine.
 */
export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  CREDENTIALS_CHANGE_REQUIRED: 'CREDENTIALS_CHANGE_REQUIRED',
  CSRF_INVALID: 'CSRF_INVALID',
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_ACCOUNT_DISABLED: 'AUTH_ACCOUNT_DISABLED',
  USERNAME_TAKEN: 'USERNAME_TAKEN',
  GROUP_NAME_TAKEN: 'GROUP_NAME_TAKEN',
  THEME_NAME_TAKEN: 'THEME_NAME_TAKEN',
  DEFAULT_THEME: 'DEFAULT_THEME',
  TEMPLATE_NAME_TAKEN: 'TEMPLATE_NAME_TAKEN',
  ADMIN_ACCOUNT_PROTECTED: 'ADMIN_ACCOUNT_PROTECTED',
  NOT_FOUND: 'NOT_FOUND',
  EDIT_CONFLICT: 'EDIT_CONFLICT',
  CONFIRMATION_REQUIRED: 'CONFIRMATION_REQUIRED',
  AUTH_TOO_MANY_ATTEMPTS: 'AUTH_TOO_MANY_ATTEMPTS',
  SOURCE_UNAVAILABLE: 'SOURCE_UNAVAILABLE',
  SOURCE_AUTH_EXPIRED: 'SOURCE_AUTH_EXPIRED',
  SOURCE_AUTH_FAILED: 'SOURCE_AUTH_FAILED',
  BLOCK_NOT_ALLOWED_IN_LAYOUT: 'BLOCK_NOT_ALLOWED_IN_LAYOUT',
  MEDIA_NAME_TAKEN: 'MEDIA_NAME_TAKEN',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  UNSUPPORTED_FILE_TYPE: 'UNSUPPORTED_FILE_TYPE',
  EXCEL_PARSE_FAILED: 'EXCEL_PARSE_FAILED',
  SOURCE_NOT_UPLOAD: 'SOURCE_NOT_UPLOAD',
  FORMULA_EXTERNAL_REF: 'FORMULA_EXTERNAL_REF',
  FORM_CLOSED: 'FORM_CLOSED',
  FORM_FULL: 'FORM_FULL',
  ADD_ZONE_FULL: 'ADD_ZONE_FULL',
  ROW_KEY_NOT_FOUND: 'ROW_KEY_NOT_FOUND',
  ROW_KEY_DUPLICATE: 'ROW_KEY_DUPLICATE',
  MOVEMENT_NOT_NUMERIC: 'MOVEMENT_NOT_NUMERIC',
  SUBMISSION_NOT_PENDING: 'SUBMISSION_NOT_PENDING',
  REIMPORT_TOKEN_EXPIRED: 'REIMPORT_TOKEN_EXPIRED',
  FORBIDDEN: 'FORBIDDEN',
  TOPIC_CLOSED: 'TOPIC_CLOSED',
  NOT_AUTHOR: 'NOT_AUTHOR',
  TOO_MANY_ATTACHMENTS: 'TOO_MANY_ATTACHMENTS',
  RESTORE_PARENT_DELETED: 'RESTORE_PARENT_DELETED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const ERROR_CODES = Object.values(ErrorCode);

/** Format commun de toute réponse d'erreur. */
export interface ApiError {
  code: ErrorCode;
  /** Texte de secours en français ; le frontend affiche la traduction de `code`. */
  message: string;
  details: Record<string, unknown>;
}

export function isApiError(value: unknown): value is ApiError {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.code === 'string' &&
    (ERROR_CODES as readonly string[]).includes(v.code) &&
    typeof v.message === 'string' &&
    typeof v.details === 'object' &&
    v.details !== null
  );
}

/**
 * Avertissements d'une action permise mais à confirmer (`409 CONFIRMATION_REQUIRED`,
 * `details.warnings`) ; traduits par `warnings.<CODE>`.
 */
export const WarningCode = {
  MEDIA_IN_USE: 'MEDIA_IN_USE',
  SOURCE_IN_USE: 'SOURCE_IN_USE',
  /** Un champ vise une cellule qui contient une formule : elle sera écrasée par une valeur. */
  FORMULA_CELL_TARGETED: 'FORMULA_CELL_TARGETED',
  /** Un Tableau ou Catalogue à plage fixe ne couvre pas la zone d'un formulaire d'ajout. */
  ADD_ZONE_NOT_COVERED: 'ADD_ZONE_NOT_COVERED',
  /** La publication invaliderait des soumissions en attente. */
  SUBMISSIONS_INVALIDATED: 'SUBMISSIONS_INVALIDATED',
} as const;
export type WarningCode = (typeof WarningCode)[keyof typeof WarningCode];
export const WARNING_CODES = Object.values(WarningCode);

export interface Warning {
  code: WarningCode;
  message: string;
  [detail: string]: unknown;
}
