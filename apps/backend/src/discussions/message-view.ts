import type { TopicMessageView } from '@strategos/shared';
import type { Prisma, User } from '../generated/prisma/client.js';
import { toAttachmentRef } from './attachments.service.js';

/** Relations à charger pour construire une vue de message. */
export const MESSAGE_INCLUDE = {
  author: { select: { id: true, username: true } },
  attachments: { orderBy: { createdAt: 'asc' } },
} as const satisfies Prisma.TopicMessageInclude;

type MessageWithRelations = Prisma.TopicMessageGetPayload<{ include: typeof MESSAGE_INCLUDE }>;

/** Vue d'un message pour un lecteur : `mine` s'il en est l'auteur. */
export function messageView(message: MessageWithRelations, user: User): TopicMessageView {
  return {
    id: message.id,
    author: message.author,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
    editedAt: message.editedAt?.toISOString() ?? null,
    attachments: message.attachments.map(toAttachmentRef),
    mine: message.authorId === user.id,
    hidden: message.hiddenAt !== null,
  };
}
