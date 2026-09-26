import type { ErrorCode } from '@strategos/shared';

/**
 * Textes de secours en français renvoyés dans `message`. Le frontend affiche
 * la traduction de `code` ; ces textes ne servent qu'en l'absence de traduction.
 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_FAILED: 'Les données envoyées sont invalides.',
  UNAUTHENTICATED: 'Vous devez être connecté.',
  CREDENTIALS_CHANGE_REQUIRED: 'Vous devez changer vos identifiants.',
  CSRF_INVALID: 'Requête refusée : rechargez la page et réessayez.',
  AUTH_INVALID_CREDENTIALS: 'Identifiants incorrects.',
  AUTH_ACCOUNT_DISABLED: 'Ce compte est désactivé.',
  USERNAME_TAKEN: 'Ce pseudo est déjà utilisé.',
  GROUP_NAME_TAKEN: 'Un groupe porte déjà ce nom.',
  ADMIN_ACCOUNT_PROTECTED: 'Le compte administrateur ne peut pas subir cette action.',
  NOT_FOUND: 'Ressource introuvable.',
  EDIT_CONFLICT: 'Cet élément a été modifié entre-temps.',
  CONFIRMATION_REQUIRED: 'Cette action demande une confirmation.',
  AUTH_TOO_MANY_ATTEMPTS: 'Trop de tentatives. Réessayez plus tard.',
  SOURCE_UNAVAILABLE: 'La source de données est injoignable.',
  SOURCE_AUTH_EXPIRED: 'La connexion à la source de données a expiré.',
  BLOCK_NOT_ALLOWED_IN_LAYOUT: 'Ce module n’est pas autorisé dans le header ou le footer.',
  MEDIA_NAME_TAKEN: 'Une image porte déjà ce nom.',
  FILE_TOO_LARGE: 'Le fichier est trop volumineux.',
  UNSUPPORTED_FILE_TYPE: 'Ce type de fichier n’est pas accepté.',
  EXCEL_PARSE_FAILED: 'Ce fichier Excel n’a pas pu être lu.',
  SOURCE_NOT_UPLOAD: 'Cette action ne concerne que les fichiers Excel uploadés.',
  INTERNAL_ERROR: 'Une erreur interne est survenue.',
};
