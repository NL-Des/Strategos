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
  THEME_NAME_TAKEN: 'Un thème porte déjà ce nom.',
  DEFAULT_THEME: 'Le thème par défaut ne peut pas être supprimé.',
  TEMPLATE_NAME_TAKEN: 'Un modèle de ce type porte déjà ce nom.',
  ADMIN_ACCOUNT_PROTECTED: 'Le compte administrateur ne peut pas subir cette action.',
  NOT_FOUND: 'Ressource introuvable.',
  EDIT_CONFLICT: 'Cet élément a été modifié entre-temps.',
  CONFIRMATION_REQUIRED: 'Cette action demande une confirmation.',
  AUTH_TOO_MANY_ATTEMPTS: 'Trop de tentatives. Réessayez plus tard.',
  SOURCE_UNAVAILABLE: 'La source de données est injoignable.',
  SOURCE_AUTH_EXPIRED: 'La connexion à la source de données a expiré.',
  BLOCK_NOT_ALLOWED_IN_LAYOUT:
    'Ce module n’est pas autorisé dans le header, le footer ou la sidebar commune.',
  MEDIA_NAME_TAKEN: 'Une image porte déjà ce nom.',
  FILE_TOO_LARGE: 'Le fichier est trop volumineux.',
  UNSUPPORTED_FILE_TYPE: 'Ce type de fichier n’est pas accepté.',
  EXCEL_PARSE_FAILED: 'Ce fichier Excel n’a pas pu être lu.',
  SOURCE_AUTH_FAILED: 'La connexion au compte a échoué.',
  SOURCE_NOT_UPLOAD: 'Cette action ne concerne que les fichiers Excel uploadés.',
  SOURCE_READ_ONLY: 'Cette source est en lecture seule.',
  SOURCE_SCRIPT_OUTDATED:
    "Le script de ce Google Sheet est à mettre à jour : recollez le script affiché par l'écran Sources, redéployez une nouvelle version, puis testez l'accès.",
  FORMULA_EXTERNAL_REF: 'Une formule saisie dans Strategos ne peut pas citer un autre classeur.',
  FORM_CLOSED: 'Ce formulaire est fermé.',
  FORM_FULL: 'Ce formulaire est complet.',
  ADD_ZONE_FULL: 'La zone d’ajout est pleine : cette soumission ne peut plus être validée.',
  ROW_KEY_NOT_FOUND: 'La ligne visée est introuvable.',
  ROW_KEY_DUPLICATE: 'Plusieurs lignes portent cette clé.',
  MOVEMENT_NOT_NUMERIC:
    'La valeur actuelle n’est pas un nombre : le mouvement ne peut pas être appliqué.',
  SUBMISSION_NOT_PENDING: 'Cette soumission a déjà été traitée.',
  REIMPORT_TOKEN_EXPIRED: 'Cet aperçu de réimport a expiré : recommencez.',
  FORBIDDEN: 'Action non autorisée.',
  TOPIC_CLOSED: 'Ce sujet est clos : aucun nouveau message.',
  NOT_AUTHOR: "Vous n'êtes pas l'auteur de ce contenu.",
  TOO_MANY_ATTACHMENTS: 'Un message accepte au plus 4 pièces jointes.',
  RESTORE_PARENT_DELETED: 'Restaurez d’abord l’élément qui le contient.',
  INTERNAL_ERROR: 'Une erreur interne est survenue.',
};
