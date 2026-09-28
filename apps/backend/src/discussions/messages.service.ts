import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AuditAction,
  AuditTargetType,
  ErrorCode,
  RevisionAction,
  type TopicMessageView,
} from '@strategos/shared';
import type { AuditActor } from '../audit/audit-actor.js';
import { AuditService } from '../audit/audit.service.js';
import { AppException } from '../common/app-exception.js';
import { sanitizeRichHtml } from '../common/html-sanitizer.js';
import type { Prisma, User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { attachToMessage } from './attach.js';
import { messageView, MESSAGE_INCLUDE } from './message-view.js';
import { SpaceAccessService } from './space-access.service.js';
import { ensureOpen } from './topics.service.js';

const notFound = () => new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);

/** Écrit l'archive d'un message avant de le modifier (07 — Points techniques). */
function archive(
  tx: Prisma.TransactionClient,
  messageId: string,
  action: RevisionAction,
  previousContent: string,
  actorId: string,
) {
  return tx.messageRevision.create({
    data: { topicMessageId: messageId, action, previousContent, actorId },
  });
}

/** Messages des sujets : poster, modifier, supprimer (auteur), masquer (admin). */
@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: SpaceAccessService,
    private readonly audit: AuditService,
  ) {}

  /** Poster dans un sujet : exige le droit de poster ; sujet clos → `422 TOPIC_CLOSED`. */
  async post(
    topicId: string,
    user: User,
    input: { content: string; attachmentIds?: string[] },
  ): Promise<TopicMessageView> {
    const { topic } = await this.access.requireTopic(user, topicId, 'post');
    ensureOpen(topic);
    const content = sanitizeRichHtml(input.content);
    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.topicMessage.create({
        data: { topicId: topic.id, authorId: user.id, content },
      });
      await attachToMessage(tx, created.id, user.id, input.attachmentIds);
      await tx.topic.update({ where: { id: topic.id }, data: { lastActivityAt: new Date() } });
      return tx.topicMessage.findUniqueOrThrow({
        where: { id: created.id },
        include: MESSAGE_INCLUDE,
      });
    });
    return messageView(message, user);
  }

  /** Modifier son message ; l'ancienne version est archivée. */
  async edit(messageId: string, user: User, content: string): Promise<TopicMessageView> {
    const { message, topic } = await this.access.requireMessage(user, messageId, 'read');
    this.access.requireAuthor(user, message.authorId);
    ensureOpen(topic);
    const clean = sanitizeRichHtml(content);
    const updated = await this.prisma.$transaction(async (tx) => {
      await archive(tx, message.id, RevisionAction.edit, message.content, user.id);
      await tx.topicMessage.update({
        where: { id: message.id },
        data: { content: clean, editedAt: new Date() },
      });
      return tx.topicMessage.findUniqueOrThrow({
        where: { id: message.id },
        include: MESSAGE_INCLUDE,
      });
    });
    return messageView(updated, user);
  }

  /** Supprimer son message (archivé). */
  async remove(messageId: string, user: User): Promise<void> {
    const { message } = await this.access.requireMessage(user, messageId, 'read');
    this.access.requireAuthor(user, message.authorId);
    await this.prisma.$transaction(async (tx) => {
      await archive(tx, message.id, RevisionAction.delete, message.content, user.id);
      await tx.topicMessage.update({ where: { id: message.id }, data: { deletedAt: new Date() } });
    });
  }

  /** Masquer ou rétablir un message (admin) : archivé et tracé au journal. */
  async setHidden(
    messageId: string,
    admin: User,
    actor: AuditActor,
    hidden: boolean,
  ): Promise<void> {
    // L'admin passe requireMessage sans contrainte de droit ; un message déjà masqué
    // reste résolvable pour le rétablir (requireMessage exclut les supprimés seulement).
    const message = await this.prisma.topicMessage.findFirst({
      where: { id: messageId, deletedAt: null },
      include: { topic: { include: { space: true } } },
    });
    if (!message || message.topic.deletedAt || message.topic.space.deletedAt) {
      throw notFound();
    }
    const alreadyHidden = message.hiddenAt !== null;
    if (alreadyHidden === hidden) return;
    await this.prisma.$transaction(async (tx) => {
      await archive(
        tx,
        message.id,
        hidden ? RevisionAction.hide : RevisionAction.unhide,
        message.content,
        admin.id,
      );
      await tx.topicMessage.update({
        where: { id: message.id },
        data: hidden
          ? { hiddenAt: new Date(), hiddenBy: admin.id }
          : { hiddenAt: null, hiddenBy: null },
      });
      await this.audit.record(tx, actor, {
        action: hidden ? AuditAction.MESSAGE_HIDE : AuditAction.MESSAGE_UNHIDE,
        targetType: AuditTargetType.MESSAGE,
        targetId: message.id,
        after: { topicId: message.topicId, spaceId: message.topic.spaceId },
      });
    });
  }
}
