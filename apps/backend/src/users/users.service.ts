import { randomBytes } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode, type Paginated, type UserSummary } from '@strategos/shared';
import { hashPassword } from '../auth/password.js';
import { SessionService } from '../auth/session.service.js';
import { AppException } from '../common/app-exception.js';
import type { Prisma, User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type Db, isUniqueViolation } from '../prisma/prisma.types.js';
import { toUserDetail } from './user.mapper.js';
import type { CreateUserDto, ListUsersQueryDto, UpdateUserDto } from './users.dto.js';

const notFound = () => new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);
const usernameTaken = () => new AppException(HttpStatus.CONFLICT, ErrorCode.USERNAME_TAKEN);

/** Cycle de vie des comptes (02 — Cycle de vie des comptes). */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
  ) {}

  async list(query: ListUsersQueryDto): Promise<Paginated<UserSummary>> {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(query.status === 'active' ? { disabledAt: null } : {}),
      ...(query.status === 'disabled' ? { disabledAt: { not: null } } : {}),
      ...(query.q ? { username: { contains: query.q, mode: 'insensitive' } } : {}),
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
    return { items: users.map(toUserDetail), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<User> {
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw notFound();
    return user;
  }

  /** Création avec un mot de passe temporaire : changement forcé à la première connexion. */
  async create(dto: CreateUserDto): Promise<User> {
    const passwordHash = await hashPassword(dto.temporaryPassword);
    try {
      return await this.prisma.user.create({
        data: { username: dto.username, passwordHash, mustChangeCredentials: true },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw usernameTaken();
      throw error;
    }
  }

  /** Modification du pseudo, avec verrouillage optimiste. */
  async update(id: string, dto: UpdateUserDto): Promise<User> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.user.updateMany({
          where: { id, deletedAt: null, version: dto.version },
          data: { username: dto.username, version: { increment: 1 } },
        });
        if (count === 0) {
          await this.getIn(tx, id);
          throw new AppException(HttpStatus.CONFLICT, ErrorCode.EDIT_CONFLICT);
        }
        return this.getIn(tx, id);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw usernameTaken();
      throw error;
    }
  }

  /** Nouveau mot de passe temporaire ; sessions révoquées. */
  async resetPassword(id: string, temporaryPassword: string): Promise<User> {
    const passwordHash = await hashPassword(temporaryPassword);
    return this.mutate(id, { passwordHash, mustChangeCredentials: true }, { revokeSessions: true });
  }

  async disable(id: string): Promise<User> {
    return this.mutate(id, { disabledAt: new Date() }, { revokeSessions: true });
  }

  async enable(id: string): Promise<User> {
    return this.mutate(id, { disabledAt: null }, { revokeSessions: false });
  }

  /** Suppression douce ; sessions révoquées, pseudo réutilisable. */
  async remove(id: string): Promise<void> {
    await this.mutate(id, { deletedAt: new Date() }, { revokeSessions: true });
  }

  /**
   * Récupération du compte admin par la commande serveur (02 — Compte administrateur) :
   * mot de passe temporaire généré, drapeau remis, sessions révoquées.
   */
  async resetAdmin(): Promise<{ username: string; temporaryPassword: string }> {
    const admin = await this.prisma.user.findFirst({ where: { isAdmin: true } });
    if (!admin) throw notFound();
    const temporaryPassword = randomBytes(12).toString('base64url');
    const passwordHash = await hashPassword(temporaryPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: admin.id },
        data: {
          passwordHash,
          mustChangeCredentials: true,
          disabledAt: null,
          deletedAt: null,
          version: { increment: 1 },
        },
      });
      await this.sessions.revokeAllForUser(admin.id, tx);
    });
    return { username: admin.username, temporaryPassword };
  }

  /**
   * Action de l'admin sur un compte. Le compte admin lui-même ne se désactive, ne se
   * supprime ni ne se réinitialise par le web : sa récupération passe par le serveur.
   */
  private async mutate(
    id: string,
    data: Prisma.UserUpdateInput,
    { revokeSessions }: { revokeSessions: boolean },
  ): Promise<User> {
    return this.prisma.$transaction(async (tx) => {
      const user = await this.getIn(tx, id);
      if (user.isAdmin) {
        throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.ADMIN_ACCOUNT_PROTECTED);
      }
      const updated = await tx.user.update({
        where: { id },
        data: { ...data, version: { increment: 1 } },
      });
      if (revokeSessions) await this.sessions.revokeAllForUser(id, tx);
      return updated;
    });
  }

  private async getIn(db: Db, id: string): Promise<User> {
    const user = await db.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw notFound();
    return user;
  }
}
