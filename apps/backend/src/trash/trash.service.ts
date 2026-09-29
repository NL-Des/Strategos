import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AuditAction,
  AuditTargetType,
  ErrorCode,
  type PageConfig,
  type Paginated,
  type Row,
  TRASH_TYPES,
  type TrashItem,
  TrashType,
} from '@strategos/shared';
import { randomUUID } from 'node:crypto';
import type { AuditActor } from '../audit/audit-actor.js';
import { AuditService } from '../audit/audit.service.js';
import { AppException } from '../common/app-exception.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { isUniqueViolation } from '../prisma/prisma.types.js';
import { plainExcerpt } from './plain-text.js';
import type { TrashQueryDto } from './trash.dto.js';

const notFound = () => new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);
const parentDeleted = () =>
  new AppException(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.RESTORE_PARENT_DELETED);

/**
 * Une branche de la corbeille par type : id, libellé, contexte, auteur, date de
 * suppression. Les notes, les médias et les sources n'y figurent pas (04).
 */
const BRANCHES: Record<TrashType, Prisma.Sql> = {
  page: Prisma.sql`
    SELECT 'page' AS type, p.id, p.name AS label, NULL::text AS context,
           NULL::text AS author, p.deleted_at
    FROM pages p WHERE p.deleted_at IS NOT NULL`,
  form: Prisma.sql`
    SELECT 'form' AS type, f.id, COALESCE(f.draft_definition->>'title', '') AS label,
           p.name AS context, NULL::text AS author, f.deleted_at
    FROM forms f JOIN pages p ON p.id = f.page_id WHERE f.deleted_at IS NOT NULL`,
  topic: Prisma.sql`
    SELECT 'topic' AS type, t.id, t.title AS label, s.name AS context,
           u.username::text AS author, t.deleted_at
    FROM topics t JOIN discussion_spaces s ON s.id = t.space_id JOIN users u ON u.id = t.author_id
    WHERE t.deleted_at IS NOT NULL`,
  topic_message: Prisma.sql`
    SELECT 'topic_message' AS type, m.id, left(m.content, 2000) AS label, t.title AS context,
           u.username::text AS author, m.deleted_at
    FROM topic_messages m JOIN topics t ON t.id = m.topic_id JOIN users u ON u.id = m.author_id
    WHERE m.deleted_at IS NOT NULL`,
  chat_message: Prisma.sql`
    SELECT 'chat_message' AS type, m.id, left(m.content, 2000) AS label, c.name AS context,
           u.username::text AS author, m.deleted_at
    FROM chat_messages m JOIN chats c ON c.id = m.chat_id JOIN users u ON u.id = m.author_id
    WHERE m.deleted_at IS NOT NULL`,
  group: Prisma.sql`
    SELECT 'group' AS type, g.id, g.name::text AS label, NULL::text AS context,
           NULL::text AS author, g.deleted_at
    FROM groups g WHERE g.deleted_at IS NOT NULL`,
  user: Prisma.sql`
    SELECT 'user' AS type, u.id, u.username::text AS label, NULL::text AS context,
           NULL::text AS author, u.deleted_at
    FROM users u WHERE u.deleted_at IS NOT NULL`,
};

const TARGET_TYPES: Record<TrashType, AuditTargetType> = {
  page: AuditTargetType.PAGE,
  form: AuditTargetType.FORM,
  topic: AuditTargetType.TOPIC,
  topic_message: AuditTargetType.MESSAGE,
  chat_message: AuditTargetType.MESSAGE,
  group: AuditTargetType.GROUP,
  user: AuditTargetType.USER,
};

interface TrashRow {
  type: TrashType;
  id: string;
  label: string;
  context: string | null;
  author: string | null;
  deleted_at: Date;
}

const isMessage = (type: TrashType) =>
  type === TrashType.TOPIC_MESSAGE || type === TrashType.CHAT_MESSAGE;

/**
 * Corbeille (04 — Corbeille) : éléments supprimés en douceur, restaurables par
 * l'admin. Chaque restauration est tracée au journal dans sa transaction.
 */
@Injectable()
export class TrashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: TrashQueryDto): Promise<Paginated<TrashItem>> {
    const branches = query.type ? [BRANCHES[query.type]] : Object.values(BRANCHES);
    const union = Prisma.join(branches, ' UNION ALL ');
    const [rows, count] = await Promise.all([
      this.prisma.$queryRaw<TrashRow[]>`
        SELECT * FROM (${union}) AS trash
        ORDER BY deleted_at DESC, id DESC
        LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`,
      this.prisma.$queryRaw<[{ total: bigint }]>`
        SELECT count(*) AS total FROM (${union}) AS trash`,
    ]);
    return {
      items: rows.map((row) => ({
        type: row.type,
        id: row.id,
        label: isMessage(row.type) ? plainExcerpt(row.label) : row.label,
        context: row.context,
        author: row.author,
        deletedAt: row.deleted_at.toISOString(),
      })),
      total: Number(count[0].total),
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /**
   * Restaure un élément supprimé. Un compte ou un groupe dont le nom a été repris
   * entre-temps → `409` ; un formulaire dont la page, ou un message de sujet dont
   * le sujet, est lui-même supprimé → `422 RESTORE_PARENT_DELETED`.
   */
  async restore(type: string, id: string, actor: AuditActor): Promise<void> {
    if (!(TRASH_TYPES as readonly string[]).includes(type)) throw notFound();
    const trashType = type as TrashType;
    try {
      await this.prisma.$transaction(async (tx) => {
        const label = await this.restoreIn(tx, trashType, id, actor);
        await this.audit.record(tx, actor, {
          action: AuditAction.TRASH_RESTORE,
          targetType: TARGET_TYPES[trashType],
          targetId: id,
          before: { type: trashType, label, deleted: true },
          after: { type: trashType, label, deleted: false },
        });
      });
    } catch (error) {
      if (isUniqueViolation(error) && trashType === TrashType.USER) {
        throw new AppException(HttpStatus.CONFLICT, ErrorCode.USERNAME_TAKEN);
      }
      if (isUniqueViolation(error) && trashType === TrashType.GROUP) {
        throw new AppException(HttpStatus.CONFLICT, ErrorCode.GROUP_NAME_TAKEN);
      }
      throw error;
    }
  }

  /** Remet `deleted_at` à vide ; renvoie le libellé de l'élément pour le journal. */
  private async restoreIn(
    tx: Prisma.TransactionClient,
    type: TrashType,
    id: string,
    actor: AuditActor,
  ): Promise<string> {
    const deleted = { id, deletedAt: { not: null } };
    switch (type) {
      case TrashType.PAGE: {
        const page = await tx.page.findFirst({ where: deleted });
        if (!page) throw notFound();
        await tx.page.update({
          where: { id },
          data: { deletedAt: null, version: { increment: 1 } },
        });
        return page.name;
      }
      case TrashType.FORM:
        return this.restoreForm(tx, id, actor);
      case TrashType.TOPIC: {
        const topic = await tx.topic.findFirst({ where: deleted });
        if (!topic) throw notFound();
        await tx.topic.update({ where: { id }, data: { deletedAt: null } });
        return topic.title;
      }
      case TrashType.TOPIC_MESSAGE: {
        const message = await tx.topicMessage.findFirst({
          where: deleted,
          include: { topic: true },
        });
        if (!message) throw notFound();
        if (message.topic.deletedAt) throw parentDeleted();
        await tx.topicMessage.update({ where: { id }, data: { deletedAt: null } });
        return plainExcerpt(message.content);
      }
      case TrashType.CHAT_MESSAGE: {
        // Le message reparaît au prochain chargement de l'historique du chat.
        const message = await tx.chatMessage.findFirst({ where: deleted });
        if (!message) throw notFound();
        await tx.chatMessage.update({ where: { id }, data: { deletedAt: null } });
        return plainExcerpt(message.content);
      }
      case TrashType.GROUP: {
        const group = await tx.group.findFirst({ where: deleted });
        if (!group) throw notFound();
        await tx.group.update({
          where: { id },
          data: { deletedAt: null, version: { increment: 1 } },
        });
        return group.name;
      }
      case TrashType.USER: {
        const user = await tx.user.findFirst({ where: deleted });
        if (!user) throw notFound();
        await tx.user.update({
          where: { id },
          data: { deletedAt: null, version: { increment: 1 } },
        });
        return user.username;
      }
    }
  }

  /**
   * Formulaire : son bloc, retiré du brouillon à la suppression, est remis dans
   * une nouvelle rangée en fin de zone principale. Le formulaire revient en ligne
   * à la prochaine publication de la page (06 — Brouillon et publication).
   */
  private async restoreForm(
    tx: Prisma.TransactionClient,
    id: string,
    actor: AuditActor,
  ): Promise<string> {
    const form = await tx.form.findFirst({
      where: { id, deletedAt: { not: null } },
      include: { page: true },
    });
    if (!form) throw notFound();
    if (form.page.deletedAt) throw parentDeleted();
    const title = (form.draftDefinition as { title?: string }).title ?? '';
    await tx.form.update({
      where: { id },
      data: { deletedAt: null, version: { increment: 1 } },
    });
    const draft = form.page.draftConfig as unknown as PageConfig;
    const row: Row = {
      id: randomUUID(),
      columns: [
        { width: '1/1', block: { id: form.blockId, type: 'form', config: { formId: form.id } } },
      ],
    };
    const config: PageConfig = {
      ...draft,
      zones: { ...draft.zones, main: [...(draft.zones.main ?? []), row] },
    };
    await tx.page.update({
      where: { id: form.pageId },
      data: {
        draftConfig: config as unknown as Prisma.InputJsonValue,
        version: { increment: 1 },
      },
    });
    await this.audit.record(tx, actor, {
      action: AuditAction.PAGE_UPDATE,
      targetType: AuditTargetType.PAGE,
      targetId: form.pageId,
      before: { name: form.page.name, formBlock: null },
      after: { name: form.page.name, formBlock: form.blockId },
    });
    return title;
  }
}
