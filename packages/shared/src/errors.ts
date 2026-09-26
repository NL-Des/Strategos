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
  ADMIN_ACCOUNT_PROTECTED: 'ADMIN_ACCOUNT_PROTECTED',
  NOT_FOUND: 'NOT_FOUND',
  EDIT_CONFLICT: 'EDIT_CONFLICT',
  CONFIRMATION_REQUIRED: 'CONFIRMATION_REQUIRED',
  AUTH_TOO_MANY_ATTEMPTS: 'AUTH_TOO_MANY_ATTEMPTS',
  SOURCE_UNAVAILABLE: 'SOURCE_UNAVAILABLE',
  SOURCE_AUTH_EXPIRED: 'SOURCE_AUTH_EXPIRED',
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
