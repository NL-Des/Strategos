import { HttpStatus, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ErrorCode } from '@strategos/shared';
import { AppException } from '../common/app-exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LOGIN_BLOCK_MS, LOGIN_MAX_FAILURES } from './auth.constants.js';

export interface Attempt {
  success: boolean;
  createdAt: Date;
}

/**
 * Secondes restantes de blocage, ou `null` si la tentative est permise.
 * `attempts` : tentatives les plus récentes d'abord. Bloqué quand les
 * `LOGIN_MAX_FAILURES` dernières sont des échecs et que le dernier date de
 * moins de `LOGIN_BLOCK_MS`.
 */
export function computeBlock(attempts: Attempt[], now: Date): number | null {
  const recent = attempts.slice(0, LOGIN_MAX_FAILURES);
  if (recent.length < LOGIN_MAX_FAILURES || recent.some((a) => a.success)) return null;
  const until = recent[0]!.createdAt.getTime() + LOGIN_BLOCK_MS;
  const remaining = until - now.getTime();
  return remaining > 0 ? Math.ceil(remaining / 1000) : null;
}

/** Limitation des tentatives par compte et par IP, stockée en base (14 — `login_attempts`). */
@Injectable()
export class LoginThrottleService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lève `429 AUTH_TOO_MANY_ATTEMPTS` si le compte ou l'IP est bloqué. */
  async assertAllowed(username: string, ip: string): Promise<void> {
    const select = { success: true, createdAt: true } as const;
    const orderBy = { createdAt: 'desc' } as const;
    const [byUsername, byIp] = await Promise.all([
      this.prisma.loginAttempt.findMany({
        where: { username },
        select,
        orderBy,
        take: LOGIN_MAX_FAILURES,
      }),
      this.prisma.loginAttempt.findMany({
        where: { ip },
        select,
        orderBy,
        take: LOGIN_MAX_FAILURES,
      }),
    ]);
    const now = new Date();
    const retryAfter = Math.max(computeBlock(byUsername, now) ?? 0, computeBlock(byIp, now) ?? 0);
    if (retryAfter > 0) {
      throw new AppException(HttpStatus.TOO_MANY_REQUESTS, ErrorCode.AUTH_TOO_MANY_ATTEMPTS, {
        retryAfter,
      });
    }
  }

  async record(username: string, ip: string, success: boolean): Promise<void> {
    await this.prisma.loginAttempt.create({ data: { username, ip, success } });
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeOld(): Promise<void> {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await this.prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: dayAgo } } });
  }
}
