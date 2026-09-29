import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AuditAction,
  AuditTargetType,
  ErrorCode,
  type Paginated,
  type TopicDetail,
  type TopicMessageView,
  type TopicSummary,
  TopicSort,
  type TopicWithMessages,
} from '@strategos/shared';
import type { AuditActor } from '../audit/audit-actor.js';
import { AuditService } from '../audit/audit.service.js';
import { AppException } from '../common/app-exception.js';
import { sanitizeRichHtml } from '../common/html-sanitizer.js';
import type { PaginationQueryDto } from '../common/pagination.dto.js';
import type { Prisma, User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { attachToMessage } from './attach.js';
import { messageView, MESSAGE_INCLUDE } from './message-view.js';
import { SpaceAccessService } from './space-access.service.js';

const authorSelect = { select: { id: true, username: true } } as const;

function topicSummary(topic: {
  id: string;
  title: string;
  author: { id: string; username: string };
  closedAt: Date | null;
  pinnedAt: Date | null;
  lastActivityAt: Date;
  createdAt: Date;
}): TopicSummary {
  return {
    id: topic.id,
    title: topic.title,
    author: topic.author,
    closed: topic.closedAt !== null,
    pinned: topic.pinnedAt !== null,
    lastActivityAt: topic.lastActivityAt.toISOString(),
    createdAt: topic.createdAt.toISOString(),
  };
}

/** Sujets d'un espace de discussion (07, 13). Les droits sont vérifiés sur `space_id`. */
@Injectable()
export class TopicsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: SpaceAccessService,
    private readonly audit: AuditService,
  ) {}

  /** Liste paginée : épinglés en tête, puis selon le tri de l'espace. */
  async listTopics(
    spaceId: string,
    user: User,
    query: PaginationQueryDto,
  ): Promise<Paginated<TopicSummary>> {
    const space = await this.access.requireSpace(user, spaceId, 'read');
    const recency: Prisma.TopicOrderByWithRelationInput =
      space.sortMode === TopicSort.created ? { createdAt: 'desc' } : { lastActivityAt: 'desc' };
    const where = { spaceId, deletedAt: null } satisfies Prisma.TopicWhereInput;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.topic.findMany({
        where,
        include: { author: authorSelect },
        orderBy: [{ pinnedAt: { sort: 'desc', nulls: 'last' } }, recency, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.topic.count({ where }),
    ]);
    return { items: rows.map(topicSummary), total, page: query.page, pageSize: query.pageSize };
  }

  /** Ouvre un sujet : premier message et pièces jointes rattachées, en une transaction. */
  async openTopic(
    spaceId: string,
    user: User,
    input: { title: string; firstMessage: string; attachmentIds?: string[] },
  ): Promise<TopicDetail> {
    await this.access.requireSpace(user, spaceId, 'createTopic');
    const content = sanitizeRichHtml(input.firstMessage);
    return this.prisma.$transaction(async (tx) => {
      const topic = await tx.topic.create({
        data: { spaceId, authorId: user.id, title: input.title.trim() },
        include: { author: authorSelect },
      });
      const message = await tx.topicMessage.create({
        data: { topicId: topic.id, authorId: user.id, content },
      });
      await attachToMessage(tx, message.id, user.id, input.attachmentIds);
      return this.detail(topic, user, true);
    });
  }

  /** Sujet et messages paginés ; masqués et supprimés exclus. */
  async getTopic(
    topicId: string,
    user: User,
    query: PaginationQueryDto,
  ): Promise<TopicWithMessages> {
    const { topic } = await this.access.requireTopic(user, topicId, 'read');
    const full = await this.prisma.topic.findUniqueOrThrow({
      where: { id: topic.id },
      include: { author: authorSelect },
    });
    // Les messages masqués sont exclus des utilisateurs ; l'admin les voit pour
    // pouvoir les rétablir. Les messages supprimés sont exclus de tous.
    const where = {
      topicId: topic.id,
      deletedAt: null,
      ...(user.isAdmin ? {} : { hiddenAt: null }),
    } satisfies Prisma.TopicMessageWhereInput;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.topicMessage.findMany({
        where,
        include: MESSAGE_INCLUDE,
        orderBy: { id: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.topicMessage.count({ where }),
    ]);
    const messages: Paginated<TopicMessageView> = {
      items: rows.map((m) => messageView(m, user)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
    return { topic: await this.detail(full, user), messages };
  }

  /** Renommer et/ou clore : réservé à l'auteur du sujet ou à l'admin (`403 NOT_AUTHOR`). */
  async patchTopic(
    topicId: string,
    user: User,
    input: { title?: string; closed?: boolean },
  ): Promise<TopicDetail> {
    const { topic } = await this.access.requireTopic(user, topicId, 'read');
    this.access.requireAuthor(user, topic.authorId);
    const data: Prisma.TopicUpdateInput = {};
    if (input.title !== undefined) data.title = input.title.trim();
    if (input.closed !== undefined) data.closedAt = input.closed ? new Date() : null;
    const updated = await this.prisma.topic.update({
      where: { id: topic.id },
      data,
      include: { author: authorSelect },
    });
    return this.detail(updated, user);
  }

  /** Épingler ou désépingler : réservé à l'admin (route admin). */
  async setPinned(topicId: string, user: User, pinned: boolean): Promise<TopicDetail> {
    const { topic } = await this.access.requireTopic(user, topicId, 'read');
    const updated = await this.prisma.topic.update({
      where: { id: topic.id },
      data: { pinnedAt: pinned ? new Date() : null },
      include: { author: authorSelect },
    });
    return this.detail(updated, user);
  }

  /** Suppression douce par l'admin (route admin) ; restaurable depuis la corbeille (04). */
  async remove(topicId: string, admin: User, actor: AuditActor): Promise<void> {
    const { topic } = await this.access.requireTopic(admin, topicId, 'read');
    await this.prisma.$transaction(async (tx) => {
      await tx.topic.update({ where: { id: topic.id }, data: { deletedAt: new Date() } });
      await this.audit.record(tx, actor, {
        action: AuditAction.TOPIC_DELETE,
        targetType: AuditTargetType.TOPIC,
        targetId: topic.id,
        before: { title: topic.title, deleted: false },
        after: { title: topic.title, deleted: true },
      });
    });
  }

  private async detail(
    topic: {
      id: string;
      spaceId: string;
      title: string;
      author: { id: string; username: string };
      closedAt: Date | null;
      pinnedAt: Date | null;
      authorId: string;
    },
    user: User,
    createTopicKnown = false,
  ): Promise<TopicDetail> {
    const closed = topic.closedAt !== null;
    const canManage = user.isAdmin || user.id === topic.authorId;
    // Après avoir ouvert un sujet, l'utilisateur a forcément le droit de poster.
    const canPost = createTopicKnown
      ? !closed
      : !closed && (await this.access.flags(user, topic.spaceId)).post;
    return {
      id: topic.id,
      title: topic.title,
      author: topic.author,
      closed,
      pinned: topic.pinnedAt !== null,
      canManage,
      canPost,
    };
  }
}

// Utilitaire non lié à la classe, mais exigé par `AppException` sur un sujet clos.
export function ensureOpen(topic: { closedAt: Date | null }): void {
  if (topic.closedAt !== null) {
    throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.TOPIC_CLOSED);
  }
}
