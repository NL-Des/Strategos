/** Corbeille de l'admin (04 — Corbeille ; 13 — Supervision). */

/** Types listés : les notes, les médias et les sources n'y figurent pas (04). */
export const TrashType = {
  PAGE: 'page',
  FORM: 'form',
  TOPIC: 'topic',
  TOPIC_MESSAGE: 'topic_message',
  CHAT_MESSAGE: 'chat_message',
  GROUP: 'group',
  USER: 'user',
} as const;
export type TrashType = (typeof TrashType)[keyof typeof TrashType];
export const TRASH_TYPES = Object.values(TrashType);

/** Ligne de la corbeille (`GET /admin/trash`), de la plus récente à la plus ancienne. */
export interface TrashItem {
  type: TrashType;
  id: string;
  /** Nom, titre, pseudo, ou début du texte d'un message (sans balises). */
  label: string;
  /** Où se trouvait l'élément : page d'un formulaire, sujet ou chat d'un message… */
  context: string | null;
  /** Auteur d'un sujet ou d'un message. */
  author: string | null;
  deletedAt: string;
}
