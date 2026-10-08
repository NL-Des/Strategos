import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Db } from '../prisma/prisma.types.js';
import { SESSION_MAX_AGE_MS, SESSION_TOUCH_INTERVAL_MS, SESSION_TTL_MS } from './auth.constants.js';
import { randomSecret } from './csrf.js';
import type { AuthContext } from './request-context.js';

/** Seule l'empreinte du jeton est stockée (`sessions.id`). */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  /** Ouvre une session et renvoie le jeton en clair, à placer dans le cookie. */
  async create(
    userId: string,
    meta: { ip?: string; userAgent?: string },
    db: Db = this.prisma,
  ): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await db.session.create({
      data: {
        id: hashSessionToken(token),
        userId,
        csrfSecret: randomSecret(),
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        ip: meta.ip ?? null,
        userAgent: meta.userAgent?.slice(0, 512) ?? null,
      },
    });
    return token;
  }

  /**
   * Session valide d'un compte actif, prolongée si besoin ; sinon `null`. La
   * prolongation ne dépasse jamais `SESSION_MAX_AGE_MS` après l'ouverture.
   */
  async resolve(token: string): Promise<AuthContext | null> {
    const id = hashSessionToken(token);
    const session = await this.prisma.session.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!session) return null;

    const now = Date.now();
    const { user } = session;
    // Fin de vie : 30 jours après l'ouverture, même si la session n'a jamais cessé de servir.
    const maxAge = session.createdAt.getTime() + SESSION_MAX_AGE_MS;
    if (session.expiresAt.getTime() <= now || maxAge <= now || user.disabledAt || user.deletedAt) {
      await this.prisma.session.deleteMany({ where: { id } });
      return null;
    }

    const renewed = now - session.lastSeenAt.getTime() > SESSION_TOUCH_INTERVAL_MS;
    if (renewed) {
      await this.prisma.session.update({
        where: { id },
        data: {
          lastSeenAt: new Date(now),
          expiresAt: new Date(Math.min(now + SESSION_TTL_MS, maxAge)),
        },
      });
    }
    return { sessionId: id, csrfSecret: session.csrfSecret, user, renewed };
  }

  async revoke(sessionId: string, db: Db = this.prisma): Promise<void> {
    await db.session.deleteMany({ where: { id: sessionId } });
  }

  /** Révoque toutes les sessions d'un compte, sauf éventuellement la session courante. */
  async revokeAllForUser(userId: string, db: Db = this.prisma, exceptSessionId?: string) {
    await db.session.deleteMany({
      where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    });
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpired(): Promise<void> {
    await this.prisma.session.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  }
}
