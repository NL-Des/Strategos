/** Notes personnelles (05 — Profil utilisateur, 13 — routes Profil). */

export const NOTE_TITLE_MAX_LENGTH = 200;
export const NOTE_CONTENT_MAX_LENGTH = 50_000;

/**
 * Note d'un utilisateur. `content` est du HTML en liste blanche (gras, italique,
 * listes, liens), nettoyé par le backend.
 */
export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}
