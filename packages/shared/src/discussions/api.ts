import type { Paginated } from '../accounts.js';
import type { UserRef } from '../rights.js';

// Espaces de discussion (07, 13 — Espaces de discussion). Types de l'API des
// sujets, messages et pièces jointes. Aucune référence à une source, une feuille
// ou une cellule : ce ne sont que des contenus utilisateurs.

/** Limites des pièces jointes (07 — Pièces jointes). */
export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;
export const MESSAGE_MAX_ATTACHMENTS = 4;

export const TOPIC_TITLE_MAX_LENGTH = 200;
export const MESSAGE_MAX_LENGTH = 20_000;

/** Pièce jointe d'un message, servie par `GET /attachments/:id`. */
export interface AttachmentRef {
  id: string;
  url: string;
  mime: string;
  sizeBytes: number;
}

/** Un message d'un sujet, vu par un lecteur (masqués et supprimés exclus). */
export interface TopicMessageView {
  id: string;
  author: UserRef;
  content: string;
  createdAt: string;
  editedAt: string | null;
  attachments: AttachmentRef[];
  /** Le lecteur est l'auteur : il peut modifier ou supprimer ce message. */
  mine: boolean;
  /** Message masqué par l'admin : renvoyé aux seuls admins, pour le rétablir. */
  hidden: boolean;
}

/** Un sujet dans la liste d'un espace. */
export interface TopicSummary {
  id: string;
  title: string;
  author: UserRef;
  closed: boolean;
  pinned: boolean;
  lastActivityAt: string;
  createdAt: string;
}

/** Un sujet ouvert : ses messages paginés. */
export interface TopicDetail {
  id: string;
  title: string;
  author: UserRef;
  closed: boolean;
  pinned: boolean;
  /** Le lecteur est l'auteur du sujet, ou l'admin : il peut renommer ou clore. */
  canManage: boolean;
  /** Le lecteur peut poster un message dans cet espace (et le sujet n'est pas clos). */
  canPost: boolean;
}

/** `GET /topics/:id` : le sujet et ses messages paginés. */
export interface TopicWithMessages {
  topic: TopicDetail;
  messages: Paginated<TopicMessageView>;
}

export interface OpenTopicInput {
  title: string;
  firstMessage: string;
  attachmentIds?: string[];
}

export interface PostMessageInput {
  content: string;
  attachmentIds?: string[];
}

export interface EditMessageInput {
  content: string;
}

/** `PATCH /topics/:id` côté utilisateur (auteur ou admin) : renommer et/ou clore. */
export interface PatchTopicInput {
  title?: string;
  closed?: boolean;
}

/** `PATCH /admin/topics/:id` : épingler ou désépingler. */
export interface PinTopicInput {
  pinned: boolean;
}

// Chat temps réel (07 — Chat, 13 §4 WebSocket du chat). Le chat n'est pas une
// ressource du modèle de droits : l'accès suit la lecture de la page. Messages
// texte seulement (pas de pièce jointe à cette étape).

/** Chemin de la passerelle WebSocket du chat (préfixe global non appliqué). */
export const CHAT_WS_PATH = '/api/v1/ws';

/** Un message de chat, vu par un lecteur (masqués et supprimés exclus). */
export interface ChatMessageView {
  id: string;
  author: UserRef;
  content: string;
  createdAt: string;
  editedAt: string | null;
  /** Le lecteur est l'auteur : il peut modifier ou supprimer ce message. */
  mine: boolean;
  /** Message masqué par l'admin : renvoyé aux seuls admins, pour le rétablir. */
  hidden: boolean;
}

/** `PUT /chat-messages/:id` (auteur) : modifier son message. */
export type EditChatMessageInput = EditMessageInput;

/**
 * Événement diffusé aux membres d'un salon (13 — Événement de chat). Pour
 * `deleted` et `hidden`, seul `message.id` est envoyé.
 */
export type ChatEvent =
  | { type: 'chat.message.created'; blockId: string; message: ChatMessageView }
  | { type: 'chat.message.updated'; blockId: string; message: ChatMessageView }
  | { type: 'chat.message.deleted'; blockId: string; message: { id: string } }
  | { type: 'chat.message.hidden'; blockId: string; message: { id: string } };

/** Codes des trames WebSocket du chat (`{ event, data }`). */
export const CHAT_WS_EVENTS = {
  join: 'chat.join',
  leave: 'chat.leave',
  send: 'chat.send',
  joined: 'chat.joined',
  ack: 'chat.ack',
  error: 'chat.error',
} as const;

/** Trames client → serveur. */
export interface ChatJoinFrame {
  blockId: string;
}
export interface ChatLeaveFrame {
  blockId: string;
}
export interface ChatSendFrame {
  blockId: string;
  /** Identifiant local du message côté client, renvoyé dans l'accusé. */
  clientId: string;
  content: string;
}

/** Trames serveur → client. */
export interface ChatJoinedFrame {
  blockId: string;
}
export interface ChatAckFrame {
  clientId: string;
  message: ChatMessageView;
}
export interface ChatErrorFrame {
  clientId?: string;
  code: string;
}
