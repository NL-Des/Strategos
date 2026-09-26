import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AuditAction,
  AuditTargetType,
  ErrorCode,
  type GroupDetail,
  type GroupPermission,
  type GroupPermissionInput,
  type GroupSummary,
  ResourceType,
} from '@strategos/shared';
import type { AuditActor } from '../audit/audit-actor.js';
import { AuditService } from '../audit/audit.service.js';
import { AppException } from '../common/app-exception.js';
import type { Group } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type Db, isUniqueViolation } from '../prisma/prisma.types.js';
import type { CreateGroupDto, UpdateGroupDto } from './groups.dto.js';

const notFound = () => new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);
const nameTaken = () => new AppException(HttpStatus.CONFLICT, ErrorCode.GROUP_NAME_TAKEN);
const invalid = (fields: Record<string, string[]>) =>
  new AppException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED, { fields });

/** Lettres de la matrice des droits (04) : L lecture, S ouvrir un sujet, P poster. */
function permissionLabel(p: GroupPermission): string {
  const letters = [p.canRead && 'L', p.canCreateTopic && 'S', p.canPost && 'P'].filter(Boolean);
  return `${p.resourceName} (${letters.join(', ')})`;
}

function groupState(group: Group) {
  return {
    name: group.name,
    description: group.description,
    deleted: group.deletedAt !== null,
  };
}

/**
 * Groupes, appartenances et permissions (03 — Gestion des groupes). Chaque
 * modification est tracée au journal dans sa transaction.
 */
@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<GroupSummary[]> {
    const groups = await this.prisma.group.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      include: { _count: { select: { members: { where: { user: { deletedAt: null } } } } } },
    });
    return groups.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      memberCount: g._count.members,
      version: g.version,
    }));
  }

  async get(id: string): Promise<GroupDetail> {
    return this.detailIn(this.prisma, id);
  }

  async create(dto: CreateGroupDto, actor: AuditActor): Promise<GroupDetail> {
    return this.withNameCheck(() =>
      this.prisma.$transaction(async (tx) => {
        const group = await tx.group.create({
          data: { name: dto.name, description: dto.description || null },
        });
        await this.audit.record(tx, actor, {
          action: AuditAction.GROUP_CREATE,
          targetType: AuditTargetType.GROUP,
          targetId: group.id,
          after: groupState(group),
        });
        return this.detailIn(tx, group.id);
      }),
    );
  }

  async update(id: string, dto: UpdateGroupDto, actor: AuditActor): Promise<GroupDetail> {
    return this.withNameCheck(() =>
      this.prisma.$transaction(async (tx) => {
        const before = await this.getIn(tx, id);
        const { count } = await tx.group.updateMany({
          where: { id, deletedAt: null, version: dto.version },
          data: {
            name: dto.name,
            description: dto.description || null,
            version: { increment: 1 },
          },
        });
        if (count === 0) throw new AppException(HttpStatus.CONFLICT, ErrorCode.EDIT_CONFLICT);
        const after = await this.getIn(tx, id);
        await this.audit.record(tx, actor, {
          action: AuditAction.GROUP_UPDATE,
          targetType: AuditTargetType.GROUP,
          targetId: id,
          before: groupState(before),
          after: groupState(after),
        });
        return this.detailIn(tx, id);
      }),
    );
  }

  /** Suppression douce : appartenances et permissions sont conservées mais n'accordent plus rien. */
  async remove(id: string, actor: AuditActor): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const before = await this.getIn(tx, id);
      const after = await tx.group.update({
        where: { id },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      });
      await this.audit.record(tx, actor, {
        action: AuditAction.GROUP_DELETE,
        targetType: AuditTargetType.GROUP,
        targetId: id,
        before: groupState(before),
        after: groupState(after),
      });
    });
  }

  /** Remplace les membres d'un groupe (depuis la fiche du groupe). */
  async replaceMembers(id: string, userIds: string[], actor: AuditActor): Promise<GroupDetail> {
    const wanted = [...new Set(userIds)];
    return this.prisma.$transaction(async (tx) => {
      const group = await this.getIn(tx, id);
      const users = await tx.user.findMany({
        where: { id: { in: wanted }, deletedAt: null },
        select: { id: true },
      });
      if (users.length !== wanted.length) throw invalid({ userIds: ['notFound'] });

      const before = await this.memberNames(tx, id);
      await tx.userGroup.deleteMany({ where: { groupId: id, userId: { notIn: wanted } } });
      await tx.userGroup.createMany({
        data: wanted.map((userId) => ({ userId, groupId: id })),
        skipDuplicates: true,
      });
      await this.audit.record(tx, actor, {
        action: AuditAction.GROUP_MEMBERS,
        targetType: AuditTargetType.GROUP,
        targetId: id,
        before: { name: group.name, members: before },
        after: { name: group.name, members: await this.memberNames(tx, id) },
      });
      return this.detailIn(tx, id);
    });
  }

  /** Remplace les groupes d'un compte (depuis la fiche de l'utilisateur). */
  async replaceUserGroups(userId: string, groupIds: string[], actor: AuditActor): Promise<void> {
    const wanted = [...new Set(groupIds)];
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({ where: { id: userId, deletedAt: null } });
      if (!user) throw notFound();
      const groups = await tx.group.findMany({
        where: { id: { in: wanted }, deletedAt: null },
        select: { id: true },
      });
      if (groups.length !== wanted.length) throw invalid({ groupIds: ['notFound'] });

      const before = await this.groupNamesOf(tx, userId);
      // Les appartenances aux groupes supprimés sont conservées (historique).
      await tx.userGroup.deleteMany({
        where: { userId, groupId: { notIn: wanted }, group: { deletedAt: null } },
      });
      await tx.userGroup.createMany({
        data: wanted.map((groupId) => ({ userId, groupId })),
        skipDuplicates: true,
      });
      await this.audit.record(tx, actor, {
        action: AuditAction.USER_GROUPS,
        targetType: AuditTargetType.USER,
        targetId: userId,
        before: { username: user.username, groups: before },
        after: { username: user.username, groups: await this.groupNamesOf(tx, userId) },
      });
    });
  }

  /**
   * Remplace les permissions d'un groupe. Une page n'accorde que la lecture, et
   * on ne crée pas sans lire (03) ; la base le refuse aussi (`CHECK`). Une ligne
   * sans aucun droit est ignorée.
   */
  async replacePermissions(
    id: string,
    inputs: GroupPermissionInput[],
    actor: AuditActor,
  ): Promise<GroupDetail> {
    const permissions = inputs.filter((p) => p.canRead || p.canCreateTopic || p.canPost);
    const fields: Record<string, string[]> = {};
    const seen = new Set<string>();
    inputs.forEach((p, i) => {
      const path = `permissions.${i}`;
      if (p.resourceType === ResourceType.page && (p.canCreateTopic || p.canPost)) {
        fields[path] = ['pageReadOnly'];
      } else if ((p.canCreateTopic || p.canPost) && !p.canRead) {
        fields[path] = ['createRequiresRead'];
      }
      const key = `${p.resourceType}:${p.resourceId}`;
      if (seen.has(key)) fields[`${path}.resourceId`] = ['duplicate'];
      seen.add(key);
    });
    if (Object.keys(fields).length > 0) throw invalid(fields);

    return this.prisma.$transaction(async (tx) => {
      const group = await this.getIn(tx, id);
      const ids = (type: ResourceType) =>
        permissions.filter((p) => p.resourceType === type).map((p) => p.resourceId);
      const [pages, spaces] = await Promise.all([
        tx.page.findMany({
          where: { id: { in: ids('page') }, deletedAt: null },
          select: { id: true },
        }),
        tx.discussionSpace.findMany({
          where: { id: { in: ids('space') }, deletedAt: null },
          select: { id: true },
        }),
      ]);
      const existing = new Set([...pages, ...spaces].map((r) => r.id));
      inputs.forEach((p, i) => {
        if (permissions.includes(p) && !existing.has(p.resourceId)) {
          fields[`permissions.${i}.resourceId`] = ['notFound'];
        }
      });
      if (Object.keys(fields).length > 0) throw invalid(fields);

      const before = (await this.permissionsIn(tx, id)).map(permissionLabel);
      // Les permissions sur une ressource supprimée sont conservées, pour une restauration.
      await tx.groupPermission.deleteMany({
        where: { groupId: id, OR: [{ page: { deletedAt: null } }, { space: { deletedAt: null } }] },
      });
      await tx.groupPermission.createMany({
        data: permissions.map((p) => ({
          groupId: id,
          pageId: p.resourceType === ResourceType.page ? p.resourceId : null,
          spaceId: p.resourceType === ResourceType.space ? p.resourceId : null,
          canRead: p.canRead,
          canCreateTopic: p.canCreateTopic,
          canPost: p.canPost,
        })),
      });
      const detail = await this.detailIn(tx, id);
      await this.audit.record(tx, actor, {
        action: AuditAction.GROUP_PERMISSIONS,
        targetType: AuditTargetType.GROUP,
        targetId: id,
        before: { name: group.name, permissions: before },
        after: { name: group.name, permissions: detail.permissions.map(permissionLabel) },
      });
      return detail;
    });
  }

  private async detailIn(db: Db, id: string): Promise<GroupDetail> {
    const group = await this.getIn(db, id);
    const members = await db.user.findMany({
      where: { deletedAt: null, groups: { some: { groupId: id } } },
      select: { id: true, username: true },
      orderBy: { username: 'asc' },
    });
    return {
      id: group.id,
      name: group.name,
      description: group.description,
      memberCount: members.length,
      version: group.version,
      members,
      permissions: await this.permissionsIn(db, id),
    };
  }

  /** Permissions déclarées sur des ressources existantes, pages puis espaces, par nom. */
  private async permissionsIn(db: Db, groupId: string): Promise<GroupPermission[]> {
    const rows = await db.groupPermission.findMany({
      where: {
        groupId,
        OR: [{ page: { deletedAt: null } }, { space: { deletedAt: null } }],
      },
      include: { page: { select: { name: true } }, space: { select: { name: true } } },
    });
    return rows
      .map((r) => ({
        resourceType: r.pageId ? ResourceType.page : ResourceType.space,
        resourceId: (r.pageId ?? r.spaceId)!,
        resourceName: (r.page?.name ?? r.space?.name)!,
        canRead: r.canRead,
        canCreateTopic: r.canCreateTopic,
        canPost: r.canPost,
      }))
      .sort(
        (a, b) =>
          a.resourceType.localeCompare(b.resourceType) ||
          a.resourceName.localeCompare(b.resourceName),
      );
  }

  private async memberNames(db: Db, groupId: string): Promise<string[]> {
    const users = await db.user.findMany({
      where: { deletedAt: null, groups: { some: { groupId } } },
      select: { username: true },
      orderBy: { username: 'asc' },
    });
    return users.map((u) => u.username);
  }

  private async groupNamesOf(db: Db, userId: string): Promise<string[]> {
    const groups = await db.group.findMany({
      where: { deletedAt: null, members: { some: { userId } } },
      select: { name: true },
      orderBy: { name: 'asc' },
    });
    return groups.map((g) => g.name);
  }

  private async getIn(db: Db, id: string): Promise<Group> {
    const group = await db.group.findFirst({ where: { id, deletedAt: null } });
    if (!group) throw notFound();
    return group;
  }

  private async withNameCheck<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (isUniqueViolation(error)) throw nameTaken();
      throw error;
    }
  }
}
