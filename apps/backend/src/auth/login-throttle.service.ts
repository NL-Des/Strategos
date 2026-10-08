import { HttpStatus, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ErrorCode } from '@strategos/shared';
import { AppException } from '../common/app-exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Db } from '../prisma/prisma.types.js';
import {
  LOGIN_BLOCK_MS,
  LOGIN_DELAY_MAX_MS,
  LOGIN_MAX_FAILURES,
  LOGIN_MAX_FAILURES_PER_IP,
} from './auth.constants.js';

export interface Attempt {
  success: boolean;
  createdAt: Date;
}

/**
 * Secondes restantes de blocage, ou `null` si la tentative est permise.
 * `attempts` : tentatives les plus récentes d'abord. Bloqué quand les `max`
 * dernières sont des échecs et que le dernier date de moins de `LOGIN_BLOCK_MS`.
 */
export function computeBlock(
  attempts: Attempt[],
  now: Date,
  max = LOGIN_MAX_FAILURES,
): number | null {
  const recent = attempts.slice(0, max);
  if (recent.length < max || recent.some((a) => a.success)) return null;
  const until = recent[0]!.createdAt.getTime() + LOGIN_BLOCK_MS;
  const remaining = until - now.getTime();
  return remaining > 0 ? Math.ceil(remaining / 1000) : null;
}

/**
 * Secondes à attendre avant la prochaine tentative sur un pseudo, toutes adresses
 * confondues, ou `null`. À partir de `LOGIN_MAX_FAILURES` échecs consécutifs
 * récents, l'attente double à chaque échec (1, 2, 4, 8 s) jusqu'à
 * `LOGIN_DELAY_MAX_MS`. Jamais un blocage sec : sinon, quiconque connaît un
 * pseudo pourrait en verrouiller le compte en échouant exprès.
 */
export function computeDelay(attempts: Attempt[], now: Date): number | null {
  let failures = 0;
  for (const attempt of attempts) {
    if (attempt.success || now.getTime() - attempt.createdAt.getTime() > LOGIN_BLOCK_MS) break;
    failures += 1;
  }
  if (failures < LOGIN_MAX_FAILURES) return null;
  const delay = Math.min(1000 * 2 ** (failures - LOGIN_MAX_FAILURES), LOGIN_DELAY_MAX_MS);
  const remaining = attempts[0]!.createdAt.getTime() + delay - now.getTime();
  return remaining > 0 ? Math.ceil(remaining / 1000) : null;
}

/** Nombre de tentatives à lire pour que `computeDelay` atteigne son plafond. */
const DELAY_DEPTH = LOGIN_MAX_FAILURES + Math.ceil(Math.log2(LOGIN_DELAY_MAX_MS / 1000));

/** Limitation des tentatives, stockée en base (02 — Points techniques, 14 — `login_attempts`). */
@Injectable()
export class LoginThrottleService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Contrôle la tentative et l'enregistre **comme un échec**, avant toute
   * vérification du mot de passe ; renvoie son id, à passer à `markSuccess`.
   * Les tentatives d'un même pseudo ou d'une même adresse passent une à une
   * (verrous consultatifs) : des requêtes simultanées ne voient pas toutes un
   * compteur à zéro. Lève `429 AUTH_TOO_MANY_ATTEMPTS` si la tentative est refusée ;
   * une tentative refusée n'est pas enregistrée.
   */
  async begin(username: string, ip: string): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('login:u:' || lower(${username}), 0))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('login:i:' || ${ip}, 0))`;

      const select = { success: true, createdAt: true } as const;
      const orderBy = { createdAt: 'desc' } as const;
      const [byPair, byIp, byUsername] = await Promise.all([
        tx.loginAttempt.findMany({
          where: { username, ip },
          select,
          orderBy,
          take: LOGIN_MAX_FAILURES,
        }),
        tx.loginAttempt.findMany({
          where: { ip },
          select,
          orderBy,
          take: LOGIN_MAX_FAILURES_PER_IP,
        }),
        tx.loginAttempt.findMany({ where: { username }, select, orderBy, take: DELAY_DEPTH }),
      ]);
      const now = new Date();
      let retryAfter = Math.max(
        computeBlock(byPair, now) ?? 0,
        computeBlock(byIp, now, LOGIN_MAX_FAILURES_PER_IP) ?? 0,
      );
      if (retryAfter === 0) {
        const delay = computeDelay(byUsername, now);
        // Une adresse d'où ce compte s'est déjà connecté n'attend pas : les échecs
        // d'un tiers ne ralentissent pas son titulaire.
        if (delay && !(await this.isKnownAddress(tx, username, ip))) retryAfter = delay;
      }
      if (retryAfter > 0) {
        throw new AppException(HttpStatus.TOO_MANY_REQUESTS, ErrorCode.AUTH_TOO_MANY_ATTEMPTS, {
          retryAfter,
        });
      }
      const attempt = await tx.loginAttempt.create({
        data: { username, ip, success: false },
        select: { id: true },
      });
      return attempt.id;
    });
  }

  /** Le mot de passe était le bon : la tentative devient un succès, ce qui remet les compteurs à zéro. */
  async markSuccess(attemptId: string): Promise<void> {
    await this.prisma.loginAttempt.update({ where: { id: attemptId }, data: { success: true } });
  }

  private async isKnownAddress(tx: Db, username: string, ip: string): Promise<boolean> {
    const [succeeded, session] = await Promise.all([
      tx.loginAttempt.count({ where: { username, ip, success: true } }),
      tx.session.count({ where: { ip, user: { username } } }),
    ]);
    return succeeded + session > 0;
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeOld(): Promise<void> {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await this.prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: dayAgo } } });
  }
}
