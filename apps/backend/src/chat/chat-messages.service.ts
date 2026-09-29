import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AuditAction,
  AuditTargetType,
  type ChatMessageView,
  ErrorCode,
  RevisionAction,
} from '@strategos/shared';
import type { AuditActor } from '../audit/audit-actor.js';
import { AuditService } from '../audit/audit.service.js';
import { AppException } from '../common/app-exception.js';
import { sanitizeRichHtml } from '../common/html-sanitizer.js';
import type { Prisma, User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ChatAccessService } from './chat-access.service.js';
import { CHAT_MESSAGE_INCLUDE, chatMessageView } from './chat-message-view.js';
import { ChatRealtimeService } from './chat-realtime.service.js';

const notFound = () => new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);

/** Écrit l'archive d'un message de chat avant de le modifier (07 — Points techniques). */
function archive(
  tx: Prisma.TransactionClient,
  messageId: string,
  action: RevisionAction,
  previousContent: string,
  actorId: string,
) {
  return tx.messageRevision.create({
    data: { chatMessageId: messageId, action, previousContent, actorId },
  });
}

/** Options de l'historique par curseur (`before`/`after`, `limit`). */
export interface HistoryQuery {
  before?: string;
  after?: string;
  limit: number;
}

/**
 * Messages du chat : envoyer, modifier, supprimer (auteur), masquer (admin). Même
 * règles d'archivage que les sujets (07). L'envoi passe par le WebSocket ; toute
 * mutation est **diffusée** aux membres du salon via `ChatRealtimeService`.
 */
@Injectable()
export class ChatMessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ChatAccessService,
    private readonly audit: AuditService,
    private readonly realtime: ChatRealtimeService,
  ) {}

  /**
   * Envoie un message dans le salon d'un bloc : exige la lecture de la page. La
   * diffusion aux autres membres est faite par la passerelle (qui connaît le
   * socket émetteur, à exclure) ; renvoie la vue pour l'accusé.
   */
  async send(blockId: string, user: User, content: string): Promise<ChatMessageView> {
    const chat = await this.access.requireChatByBlock(user, blockId);
    const clean = sanitizeRichHtml(content);
    const created = await this.prisma.chatMessage.create({
      data: { chatId: chat.id, authorId: user.id, content: clean },
      include: CHAT_MESSAGE_INCLUDE,
    });
    return chatMessageView(created, user.id);
  }

  /**
   * Modifier son message ; l'ancienne version est archivée, la mise à jour
   * diffusée. L'admin peut aussi modifier celui d'un autre : c'est alors tracé.
   */
  async edit(
    messageId: string,
    user: User,
    actor: AuditActor,
    content: string,
  ): Promise<ChatMessageView> {
    const { message, chat } = await this.access.requireChatMessage(user, messageId);
    this.access.requireAuthor(user, message.authorId);
    const clean = sanitizeRichHtml(content);
    const updated = await this.prisma.$transaction(async (tx) => {
      await archive(tx, message.id, RevisionAction.edit, message.content, user.id);
      await tx.chatMessage.update({
        where: { id: message.id },
        data: { content: clean, editedAt: new Date() },
      });
      if (message.authorId !== user.id) {
        await this.audit.record(tx, actor, {
          action: AuditAction.MESSAGE_ADMIN_EDIT,
          targetType: AuditTargetType.MESSAGE,
          targetId: message.id,
          after: { chatId: chat.id },
        });
      }
      return tx.chatMessage.findUniqueOrThrow({
        where: { id: message.id },
        include: CHAT_MESSAGE_INCLUDE,
      });
    });
    this.realtime.broadcast({
      type: 'chat.message.updated',
      blockId: chat.blockId,
      message: chatMessageView(updated, null),
    });
    return chatMessageView(updated, user.id);
  }

  /**
   * Supprimer son message (archivé) ; la suppression est diffusée. Celle du
   * message d'un autre par l'admin est tracée au journal.
   */
  async remove(messageId: string, user: User, actor: AuditActor): Promise<void> {
    const { message, chat } = await this.access.requireChatMessage(user, messageId);
    this.access.requireAuthor(user, message.authorId);
    await this.prisma.$transaction(async (tx) => {
      await archive(tx, message.id, RevisionAction.delete, message.content, user.id);
      await tx.chatMessage.update({ where: { id: message.id }, data: { deletedAt: new Date() } });
      if (message.authorId !== user.id) {
        await this.audit.record(tx, actor, {
          action: AuditAction.MESSAGE_ADMIN_DELETE,
          targetType: AuditTargetType.MESSAGE,
          targetId: message.id,
          after: { chatId: chat.id },
        });
      }
    });
    this.realtime.broadcast({
      type: 'chat.message.deleted',
      blockId: chat.blockId,
      message: { id: message.id },
    });
  }

  /** Masquer ou rétablir un message (admin) : archivé, tracé au journal, diffusé. */
  async setHidden(
    messageId: string,
    admin: User,
    actor: AuditActor,
    hidden: boolean,
  ): Promise<void> {
    // L'admin passe sans contrainte de droit ; un message déjà masqué reste
    // résolvable pour le rétablir (les supprimés seuls sont exclus).
    const message = await this.prisma.chatMessage.findFirst({
      where: { id: messageId, deletedAt: null },
      include: { chat: true, author: { select: { id: true, username: true } } },
    });
    if (!message || message.chat.deletedAt) throw notFound();
    const alreadyHidden = message.hiddenAt !== null;
    if (alreadyHidden === hidden) return;
    const updated = await this.prisma.$transaction(async (tx) => {
      await archive(
        tx,
        message.id,
        hidden ? RevisionAction.hide : RevisionAction.unhide,
        message.content,
        admin.id,
      );
      const row = await tx.chatMessage.update({
        where: { id: message.id },
        data: hidden
          ? { hiddenAt: new Date(), hiddenBy: admin.id }
          : { hiddenAt: null, hiddenBy: null },
        include: CHAT_MESSAGE_INCLUDE,
      });
      await this.audit.record(tx, actor, {
        action: hidden ? AuditAction.MESSAGE_HIDE : AuditAction.MESSAGE_UNHIDE,
        targetType: AuditTargetType.MESSAGE,
        targetId: message.id,
        after: { chatId: message.chatId },
      });
      return row;
    });
    // Masqué : les clients retirent le message (`id` seul). Rétabli : ils le
    // réaffichent avec son contenu (`updated`).
    if (hidden) {
      this.realtime.broadcast({
        type: 'chat.message.hidden',
        blockId: message.chat.blockId,
        message: { id: message.id },
      });
    } else {
      this.realtime.broadcast({
        type: 'chat.message.updated',
        blockId: message.chat.blockId,
        message: chatMessageView(updated, null),
      });
    }
  }

  /** Historique par curseur (`before`/`after`, `limit`), en ordre chronologique. */
  async history(blockId: string, user: User, query: HistoryQuery): Promise<ChatMessageView[]> {
    const chat = await this.access.requireChatByBlock(user, blockId);
    const where: Prisma.ChatMessageWhereInput = {
      chatId: chat.id,
      deletedAt: null,
      ...(user.isAdmin ? {} : { hiddenAt: null }),
    };
    // `after` : les messages plus récents que le curseur, dans l'ordre ; sinon les
    // plus récents (avant le curseur ou tout court), renversés en ordre croissant.
    if (query.after) where.id = { gt: query.after };
    else if (query.before) where.id = { lt: query.before };
    const ascending = Boolean(query.after);
    const rows = await this.prisma.chatMessage.findMany({
      where,
      include: CHAT_MESSAGE_INCLUDE,
      orderBy: { id: ascending ? 'asc' : 'desc' },
      take: query.limit,
    });
    if (!ascending) rows.reverse();
    return rows.map((row) => chatMessageView(row, user.id));
  }
}
