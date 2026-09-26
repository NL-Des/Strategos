import { randomBytes } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AuditAction,
  AuditTargetType,
  ErrorCode,
  type Paginated,
  type UserDetail,
  type UserSummary,
} from '@strategos/shared';
import { CLI_ACTOR, type AuditActor } from '../audit/audit-actor.js';
import { AuditService } from '../audit/audit.service.js';
import { hashPassword } from '../auth/password.js';
import { SessionService } from '../auth/session.service.js';
import { AppException } from '../common/app-exception.js';
import type { Prisma, User } from '../generated/prisma/client.js';
import { RightsService } from '../groups/rights.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type Db, isUniqueViolation } from '../prisma/prisma.types.js';
import { toUserAuditState, toUserDetail, toUserSummary } from './user.mapper.js';
import type { CreateUserDto, ListUsersQueryDto, UpdateUserDto } from './users.dto.js';

const notFound = () => new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);
const usernameTaken = () => new AppException(HttpStatus.CONFLICT, ErrorCode.USERNAME_TAKEN);
const invalid = (fields: Record<string, string[]>) =>
  new AppException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED, { fields });

/** Cycle de vie des comptes (02) ; chaque action est tracée au journal dans sa transaction. */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly rights: RightsService,
  ) {}

  async list(query: ListUsersQueryDto): Promise<Paginated<UserSummary>> {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(query.status === 'active' ? { disabledAt: null } : {}),
      ...(query.status === 'disabled' ? { disabledAt: { not: null } } : {}),
      ...(query.q ? { username: { contains: query.q, mode: 'insensitive' } } : {}),
      ...(query.groupId
        ? { groups: { some: { groupId: query.groupId, group: { deletedAt: null } } } }
        : {}),
    };
    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { username: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items: users.map(toUserSummary), total, page: query.page, pageSize: query.pageSize };
  }

  /** Fiche : compte, page personnelle, groupes et droits effectifs. */
  async detail(id: string): Promise<UserDetail> {
    const user = await this.getIn(this.prisma, id);
    return toUserDetail(user, await this.rights.userRights(id));
  }

  /**
   * Création avec un mot de passe temporaire (changement forcé à la première
   * connexion), et éventuellement ses groupes.
   */
  async create(dto: CreateUserDto, actor: AuditActor): Promise<User> {
    const groupIds = [...new Set(dto.groupIds ?? [])];
    const groups = await this.prisma.group.findMany({
      where: { id: { in: groupIds }, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    if (groups.length !== groupIds.length) throw invalid({ groupIds: ['notFound'] });
    const passwordHash = await hashPassword(dto.temporaryPassword);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { username: dto.username, passwordHash, mustChangeCredentials: true },
        });
        await tx.userGroup.createMany({
          data: groupIds.map((groupId) => ({ userId: user.id, groupId })),
        });
        await this.audit.record(tx, actor, {
          action: AuditAction.USER_CREATE,
          targetType: AuditTargetType.USER,
          targetId: user.id,
          after: { ...toUserAuditState(user), groups: groups.map((g) => g.name) },
        });
        return user;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw usernameTaken();
      throw error;
    }
  }

  /** Modification du pseudo et de la page personnelle, avec verrouillage optimiste. */
  async update(id: string, dto: UpdateUserDto, actor: AuditActor): Promise<User> {
    if (
      dto.personalPageId &&
      !(await this.prisma.page.count({ where: { id: dto.personalPageId, deletedAt: null } }))
    ) {
      throw invalid({ personalPageId: ['notFound'] });
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const before = await this.getIn(tx, id);
        const { count } = await tx.user.updateMany({
          where: { id, deletedAt: null, version: dto.version },
          data: {
            username: dto.username,
            ...(dto.personalPageId !== undefined ? { personalPageId: dto.personalPageId } : {}),
            version: { increment: 1 },
          },
        });
        if (count === 0) throw new AppException(HttpStatus.CONFLICT, ErrorCode.EDIT_CONFLICT);
        const after = await this.getIn(tx, id);
        await this.audit.record(tx, actor, {
          action: AuditAction.USER_UPDATE,
          targetType: AuditTargetType.USER,
          targetId: id,
          before: toUserAuditState(before),
          after: toUserAuditState(after),
        });
        return after;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw usernameTaken();
      throw error;
    }
  }

  /** Nouveau mot de passe temporaire ; sessions révoquées. */
  async resetPassword(id: string, temporaryPassword: string, actor: AuditActor): Promise<User> {
    const passwordHash = await hashPassword(temporaryPassword);
    return this.mutate(id, actor, AuditAction.USER_RESET_PASSWORD, {
      data: { passwordHash, mustChangeCredentials: true },
      revokeSessions: true,
    });
  }

  async disable(id: string, actor: AuditActor): Promise<User> {
    return this.mutate(id, actor, AuditAction.USER_DISABLE, {
      data: { disabledAt: new Date() },
      revokeSessions: true,
    });
  }

  async enable(id: string, actor: AuditActor): Promise<User> {
    return this.mutate(id, actor, AuditAction.USER_ENABLE, {
      data: { disabledAt: null },
      revokeSessions: false,
    });
  }

  /** Suppression douce ; sessions révoquées, pseudo réutilisable. */
  async remove(id: string, actor: AuditActor): Promise<void> {
    await this.mutate(id, actor, AuditAction.USER_DELETE, {
      data: { deletedAt: new Date() },
      revokeSessions: true,
    });
  }

  /**
   * Récupération du compte admin par la commande serveur (02 — Compte administrateur) :
   * mot de passe temporaire généré, drapeau remis, sessions révoquées, action tracée.
   */
  async resetAdmin(): Promise<{ username: string; temporaryPassword: string }> {
    const temporaryPassword = randomBytes(12).toString('base64url');
    const passwordHash = await hashPassword(temporaryPassword);
    const admin = await this.prisma.$transaction(async (tx) => {
      const before = await tx.user.findFirst({ where: { isAdmin: true } });
      if (!before) throw notFound();
      const after = await tx.user.update({
        where: { id: before.id },
        data: {
          passwordHash,
          mustChangeCredentials: true,
          disabledAt: null,
          deletedAt: null,
          version: { increment: 1 },
        },
      });
      await this.sessions.revokeAllForUser(before.id, tx);
      await this.audit.record(tx, CLI_ACTOR, {
        action: AuditAction.USER_RESET_PASSWORD,
        targetType: AuditTargetType.USER,
        targetId: before.id,
        before: toUserAuditState(before),
        after: toUserAuditState(after),
      });
      return after;
    });
    return { username: admin.username, temporaryPassword };
  }

  /**
   * Action de l'admin sur un compte. Le compte admin lui-même ne se désactive, ne se
   * supprime ni ne se réinitialise par le web : sa récupération passe par le serveur.
   */
  private async mutate(
    id: string,
    actor: AuditActor,
    action: AuditAction,
    { data, revokeSessions }: { data: Prisma.UserUpdateInput; revokeSessions: boolean },
  ): Promise<User> {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.getIn(tx, id);
      if (before.isAdmin) {
        throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.ADMIN_ACCOUNT_PROTECTED);
      }
      const after = await tx.user.update({
        where: { id },
        data: { ...data, version: { increment: 1 } },
      });
      if (revokeSessions) await this.sessions.revokeAllForUser(id, tx);
      await this.audit.record(tx, actor, {
        action,
        targetType: AuditTargetType.USER,
        targetId: id,
        before: toUserAuditState(before),
        after: toUserAuditState(after),
      });
      return after;
    });
  }

  private async getIn(db: Db, id: string): Promise<User> {
    const user = await db.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw notFound();
    return user;
  }
}
