import type { ErrorCode } from '@strategos/shared';

/**
 * Textes de secours en français renvoyés dans `message`. Le frontend affiche
 * la traduction de `code` ; ces textes ne servent qu'en l'absence de traduction.
 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_FAILED: 'Les données envoyées sont invalides.',
  UNAUTHENTICATED: 'Vous devez être connecté.',
  CREDENTIALS_CHANGE_REQUIRED: 'Vous devez changer vos identifiants.',
  NOT_FOUND: 'Ressource introuvable.',
  EDIT_CONFLICT: 'Cet élément a été modifié entre-temps.',
  CONFIRMATION_REQUIRED: 'Cette action demande une confirmation.',
  AUTH_TOO_MANY_ATTEMPTS: 'Trop de tentatives. Réessayez plus tard.',
  SOURCE_UNAVAILABLE: 'La source de données est injoignable.',
  SOURCE_AUTH_EXPIRED: 'La connexion à la source de données a expiré.',
  INTERNAL_ERROR: 'Une erreur interne est survenue.',
};
