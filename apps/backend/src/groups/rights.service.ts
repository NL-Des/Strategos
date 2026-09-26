import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type EffectiveRights,
  ErrorCode,
  type GroupRef,
  type Paginated,
  type ResourceRef,
  type ResourceRights,
  ResourceType,
  type Right,
  type RightsMatrix,
  type UserRef,
  type UserRights,
} from '@strategos/shared';
import { AppException } from '../common/app-exception.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { resolveRights, resourceKey } from './resolve-rights.js';
import type { RightsMatrixQueryDto } from './groups.dto.js';

/** Sujet des droits : un compte réel, ou le membre fictif d'un seul groupe (aperçu). */
export type RightsSubject = { userId: string } | { groupId: string };

const notFound = () => new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);

const PERMISSION_SELECT = {
  groupId: true,
  pageId: true,
  spaceId: true,
  canRead: true,
  canCreateTopic: true,
  canPost: true,
} as const;

/** Un groupe supprimé n'accorde plus rien. */
const activeGroup = { deletedAt: null } satisfies Prisma.GroupWhereInput;

function toFlags(rights: EffectiveRights): Record<Right, boolean> {
  return {
    read: rights.read.length > 0,
    createTopic: rights.createTopic.length > 0,
    post: rights.post.length > 0,
  };
}

/**
 * Droits effectifs (03). Toutes les vues — `PermissionsGuard`, assemblage des
 * pages, vues d'administration, profil — passent par `resolveRights` : ce que
 * l'admin voit est exactement ce qui est appliqué. L'admin n'est jamais résolu :
 * il a tous les droits, et ce sont les appelants qui le laissent passer.
 */
@Injectable()
export class RightsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Droits d'un sujet, éventuellement limités à quelques ressources. */
  async rightsOf(
    subject: RightsSubject,
    only?: { type: ResourceType; ids: string[] },
  ): Promise<Map<string, EffectiveRights>> {
    const groups = await this.groupsOf(subject);
    if (groups.length === 0) return new Map();
    const permissions = await this.prisma.groupPermission.findMany({
      where: {
        groupId: { in: groups.map((g) => g.id) },
        ...(only?.type === ResourceType.page ? { pageId: { in: only.ids } } : {}),
        ...(only?.type === ResourceType.space ? { spaceId: { in: only.ids } } : {}),
      },
      select: PERMISSION_SELECT,
    });
    return resolveRights(groups, permissions);
  }

  /** Parmi `ids`, les ressources que le sujet peut lire. */
  async readable(subject: RightsSubject, type: ResourceType, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rights = await this.rightsOf(subject, { type, ids });
    return new Set(ids.filter((id) => rights.get(resourceKey(type, id))?.read.length));
  }

  async canRead(subject: RightsSubject, type: ResourceType, id: string): Promise<boolean> {
    return (await this.readable(subject, type, [id])).has(id);
  }

  /** Vue « par utilisateur » et profil : groupes et droits effectifs d'un compte. */
  async userRights(userId: string): Promise<UserRights> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, username: true },
    });
    if (!user) throw notFound();
    const groups = await this.groupsOf({ userId });
    const rights = await this.rightsOf({ userId });
    const resources = await this.resourcesByKey([...rights.keys()]);
    return {
      user,
      groups,
      resources: [...resources.entries()].map(([key, resource]) => ({
        resource,
        rights: rights.get(key)!,
      })),
    };
  }

  /** Vue « par ressource » : groupes qui la déclarent, comptes qui en ont un droit. */
  async resourceRights(type: ResourceType, id: string): Promise<ResourceRights> {
    const key = resourceKey(type, id);
    const resource = (await this.resourcesByKey([key])).get(key);
    if (!resource) throw notFound();

    const permissions = await this.prisma.groupPermission.findMany({
      where: {
        ...(type === ResourceType.page ? { pageId: id } : { spaceId: id }),
        group: { deletedAt: null },
      },
      select: { ...PERMISSION_SELECT, group: { select: { id: true, name: true } } },
      orderBy: { group: { name: 'asc' } },
    });
    const memberships = await this.prisma.userGroup.findMany({
      where: {
        groupId: { in: permissions.map((p) => p.groupId) },
        user: { deletedAt: null, isAdmin: false },
      },
      select: { user: { select: { id: true, username: true } }, groupId: true },
    });
    const users = new Map<string, UserRef>(memberships.map((m) => [m.user.id, m.user]));
    const rows = [...users.values()]
      .sort((a, b) => a.username.localeCompare(b.username))
      .flatMap((user) => {
        const groupIds = new Set(
          memberships.filter((m) => m.user.id === user.id).map((m) => m.groupId),
        );
        const groups = permissions.filter((p) => groupIds.has(p.groupId)).map((p) => p.group);
        const rights = resolveRights(groups, permissions).get(key);
        return rights ? [{ user, rights }] : [];
      });

    return {
      resource,
      groups: permissions.map((p) => ({
        group: p.group,
        permission: { read: p.canRead, createTopic: p.canCreateTopic, post: p.canPost },
      })),
      users: rows,
    };
  }

  /** Matrice globale utilisateurs × ressources, paginée sur les comptes. */
  async matrix(query: RightsMatrixQueryDto): Promise<RightsMatrix> {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      isAdmin: false,
      ...(query.group ? { groups: { some: { groupId: query.group } } } : {}),
      ...(query.user ? { username: { contains: query.user, mode: 'insensitive' } } : {}),
    };
    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { username: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          username: true,
          groups: {
            where: { group: activeGroup },
            select: { group: { select: { id: true, name: true } } },
            orderBy: { group: { name: 'asc' } },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    const groupIds = [...new Set(users.flatMap((u) => u.groups.map((g) => g.group.id)))];
    const permissions = await this.prisma.groupPermission.findMany({
      where: {
        groupId: { in: groupIds },
        ...(query.type === ResourceType.page ? { pageId: { not: null } } : {}),
        ...(query.type === ResourceType.space ? { spaceId: { not: null } } : {}),
      },
      select: PERMISSION_SELECT,
    });

    const resources = await this.allResources(query.type);
    const known = new Set(resources.map((r) => resourceKey(r.type, r.id)));
    const items: RightsMatrix['users']['items'] = users.map((user) => {
      const rights = resolveRights(
        user.groups.map((g) => g.group),
        permissions,
      );
      const cells: Record<string, Record<Right, boolean>> = {};
      for (const [key, value] of rights) if (known.has(key)) cells[key] = toFlags(value);
      return { user: { id: user.id, username: user.username }, cells };
    });
    const page: Paginated<(typeof items)[number]> = {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
    return { resources, users: page };
  }

  /** Groupes actifs du sujet, par nom. */
  private async groupsOf(subject: RightsSubject): Promise<GroupRef[]> {
    const where: Prisma.GroupWhereInput =
      'userId' in subject
        ? {
            ...activeGroup,
            members: { some: { userId: subject.userId, user: { deletedAt: null } } },
          }
        : { ...activeGroup, id: subject.groupId };
    return this.prisma.group.findMany({
      where,
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  /** Ressources existantes (non supprimées), par clé, dans l'ordre : pages puis espaces, par nom. */
  private async resourcesByKey(keys: string[]): Promise<Map<string, ResourceRef>> {
    const ids = (type: ResourceType) =>
      keys.filter((k) => k.startsWith(`${type}:`)).map((k) => k.slice(type.length + 1));
    const [pages, spaces] = await Promise.all([
      this.prisma.page.findMany({
        where: { id: { in: ids(ResourceType.page) }, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.discussionSpace.findMany({
        where: { id: { in: ids(ResourceType.space) }, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    const refs: ResourceRef[] = [
      ...pages.map((p) => ({ type: ResourceType.page, ...p })),
      ...spaces.map((s) => ({ type: ResourceType.space, ...s })),
    ];
    return new Map(refs.map((r) => [resourceKey(r.type, r.id), r]));
  }

  private async allResources(type?: ResourceType): Promise<ResourceRef[]> {
    const [pages, spaces] = await Promise.all([
      type === ResourceType.space
        ? []
        : this.prisma.page.findMany({
            where: { deletedAt: null },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          }),
      type === ResourceType.page
        ? []
        : this.prisma.discussionSpace.findMany({
            where: { deletedAt: null },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          }),
    ]);
    return [
      ...pages.map((p) => ({ type: ResourceType.page, ...p })),
      ...spaces.map((s) => ({ type: ResourceType.space, ...s })),
    ];
  }
}
