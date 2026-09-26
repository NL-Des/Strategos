/** Réglages de l'authentification (02 — Points techniques). */
export const SESSION_COOKIE = 'strategos_session';
/** Secret CSRF d'un visiteur pas encore connecté (formulaire de connexion). */
export const PRESESSION_COOKIE = 'strategos_presession';

/** Session glissante : expire après 7 jours sans activité. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** La prolongation n'est écrite en base qu'une fois par minute au plus. */
export const SESSION_TOUCH_INTERVAL_MS = 60 * 1000;

/** Blocage après 5 échecs consécutifs sur un compte ou une IP, pendant 15 minutes. */
export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_BLOCK_MS = 15 * 60 * 1000;
