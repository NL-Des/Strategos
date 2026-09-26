import { Injectable } from '@nestjs/common';
import type { AuditAction, AuditEntry, AuditTargetType, Paginated } from '@strategos/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuditActor } from './audit-actor.js';
import type { AuditQueryDto } from './audit.dto.js';

export interface AuditRecord {
  action: AuditAction;
  targetType: AuditTargetType;
  targetId?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
}

/**
 * Journal des modifications (04). Une entrée s'écrit **dans la transaction** de la
 * modification qu'elle trace : si l'une échoue, l'autre est annulée. Aucune
 * méthode ne modifie ni ne supprime une entrée (la base l'interdit aussi).
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(tx: Prisma.TransactionClient, actor: AuditActor, entry: AuditRecord) {
    // Seul le client racine a `$connect` ; celui d'une transaction ne l'a pas. On
    // refuse une écriture qui ne serait pas liée à la modification tracée.
    if (typeof (tx as { $connect?: unknown }).$connect === 'function') {
      throw new Error('Le journal doit être écrit dans la transaction de la modification.');
    }
    await tx.auditLog.create({
      data: {
        actorKind: actor.kind,
        actorId: actor.kind === 'user' ? actor.userId : null,
        ip: actor.kind === 'user' ? actor.ip : null,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId ?? null,
        ...(entry.before !== undefined ? { before: entry.before } : {}),
        ...(entry.after !== undefined ? { after: entry.after } : {}),
      },
    });
  }

  async list(query: AuditQueryDto): Promise<Paginated<AuditEntry>> {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.actorKind ? { actorKind: query.actorKind } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.targetId ? { targetId: query.targetId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lt: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, username: true } } },
        // UUID v7 : l'id départage les entrées de même horodatage, dans l'ordre d'écriture.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        actorKind: row.actorKind,
        actor: row.actor,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        before: row.before,
        after: row.after,
        ip: row.ip,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
}
