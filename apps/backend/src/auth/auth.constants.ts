/** Réglages de l'authentification (02 — Points techniques). */
export const SESSION_COOKIE = 'strategos_session';
/** Secret CSRF d'un visiteur pas encore connecté (formulaire de connexion). */
export const PRESESSION_COOKIE = 'strategos_presession';

/** Session glissante : expire après 7 jours sans activité. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Durée de vie maximale d'une session, quelle que soit son activité : 30 jours. */
export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** La prolongation n'est écrite en base qu'une fois par minute au plus. */
export const SESSION_TOUCH_INTERVAL_MS = 60 * 1000;

/**
 * Blocage de 15 minutes après 5 échecs consécutifs d'un couple pseudo + adresse,
 * ou 20 depuis une même adresse (plusieurs personnes peuvent la partager).
 */
export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_MAX_FAILURES_PER_IP = 20;
export const LOGIN_BLOCK_MS = 15 * 60 * 1000;
/** Attente maximale entre deux tentatives sur un pseudo, toutes adresses confondues. */
export const LOGIN_DELAY_MAX_MS = 15 * 1000;
