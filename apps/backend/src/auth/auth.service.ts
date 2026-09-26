import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode } from '@strategos/shared';
import { AppException } from '../common/app-exception.js';
import type { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { isUniqueViolation } from '../prisma/prisma.types.js';
import type { ChangeCredentialsDto, LoginDto } from './auth.dto.js';
import { LoginThrottleService } from './login-throttle.service.js';
import { hashPassword, verifyPassword } from './password.js';
import type { AuthContext } from './request-context.js';
import { SessionService } from './session.service.js';

export interface ClientMeta {
  ip: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly throttle: LoginThrottleService,
  ) {}

  /**
   * Connexion. Renvoie le compte et le jeton de la nouvelle session ; l'éventuelle
   * session précédente est révoquée (rotation). Un compte désactivé ou supprimé
   * n'est signalé qu'avec le bon mot de passe, pour ne pas révéler les comptes.
   */
  async login(dto: LoginDto, meta: ClientMeta, previousSessionId?: string) {
    const username = dto.username.trim();
    await this.throttle.assertAllowed(username, meta.ip);

    const user =
      (await this.prisma.user.findFirst({ where: { username, deletedAt: null } })) ??
      (await this.prisma.user.findFirst({
        where: { username, deletedAt: { not: null } },
        orderBy: { deletedAt: 'desc' },
      }));

    const valid = await verifyPassword(user?.passwordHash ?? null, dto.password);
    if (!user || !valid) {
      await this.throttle.record(username, meta.ip, false);
      throw new AppException(HttpStatus.UNAUTHORIZED, ErrorCode.AUTH_INVALID_CREDENTIALS);
    }
    if (user.disabledAt || user.deletedAt) {
      await this.throttle.record(username, meta.ip, false);
      throw new AppException(HttpStatus.FORBIDDEN, ErrorCode.AUTH_ACCOUNT_DISABLED);
    }

    await this.throttle.record(username, meta.ip, true);
    const token = await this.prisma.$transaction(async (tx) => {
      if (previousSessionId) await this.sessions.revoke(previousSessionId, tx);
      return this.sessions.create(user.id, meta, tx);
    });
    return { user, token };
  }

  /**
   * Changement d'identifiants (forcé après un mot de passe temporaire). Lève le
   * drapeau et révoque les autres sessions du compte.
   */
  async changeCredentials(
    auth: AuthContext,
    dto: ChangeCredentialsDto,
    meta: ClientMeta,
  ): Promise<User> {
    const { user } = auth;
    if (dto.newUsername !== undefined && !user.isAdmin) {
      throw new AppException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED, {
        fields: { newUsername: ['notAllowed'] },
      });
    }

    await this.throttle.assertAllowed(user.username, meta.ip);
    if (!(await verifyPassword(user.passwordHash, dto.currentPassword))) {
      await this.throttle.record(user.username, meta.ip, false);
      throw new AppException(HttpStatus.UNAUTHORIZED, ErrorCode.AUTH_INVALID_CREDENTIALS);
    }
    if (dto.newPassword === dto.currentPassword) {
      throw new AppException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED, {
        fields: { newPassword: ['sameAsCurrent'] },
      });
    }

    const passwordHash = await hashPassword(dto.newPassword);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id: user.id },
          data: {
            passwordHash,
            mustChangeCredentials: false,
            ...(dto.newUsername !== undefined ? { username: dto.newUsername } : {}),
            version: { increment: 1 },
          },
        });
        await this.sessions.revokeAllForUser(user.id, tx, auth.sessionId);
        return updated;
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new AppException(HttpStatus.CONFLICT, ErrorCode.USERNAME_TAKEN);
      throw error;
    }
  }
}
