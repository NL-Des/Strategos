import type { ChatMessageView } from '@strategos/shared';
import type { Prisma } from '../generated/prisma/client.js';

/** Relations à charger pour construire une vue de message de chat. */
export const CHAT_MESSAGE_INCLUDE = {
  author: { select: { id: true, username: true } },
} as const satisfies Prisma.ChatMessageInclude;

type ChatMessageWithRelations = Prisma.ChatMessageGetPayload<{
  include: typeof CHAT_MESSAGE_INCLUDE;
}>;

/**
 * Vue d'un message de chat pour un lecteur : `mine` s'il en est l'auteur. Le
 * chat ne porte pas de pièce jointe (07 — Chat). `viewerId` à `null` : diffusion
 * sans lecteur défini (le drapeau `mine` est recalculé par destinataire).
 */
export function chatMessageView(
  message: ChatMessageWithRelations,
  viewerId: string | null,
): ChatMessageView {
  return {
    id: message.id,
    author: message.author,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
    editedAt: message.editedAt?.toISOString() ?? null,
    mine: viewerId !== null && message.authorId === viewerId,
    hidden: message.hiddenAt !== null,
  };
}
