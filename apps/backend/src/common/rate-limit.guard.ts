import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode } from '@strategos/shared';
import type { Request } from 'express';
import { config } from '../config.js';
import { AppException } from './app-exception.js';

const WINDOW_MS = 60_000;

/**
 * Limite de débit générale (13 — Qui protège quoi) : `config.rateLimitPerMinute`
 * requêtes par minute et par session, ou par adresse pour un visiteur sans
 * session. Compteurs en mémoire : un redémarrage les remet à zéro, ce qui suffit
 * pour empêcher un compte de créer du contenu en boucle. Placé après
 * `SessionGuard`, dont il lit la session.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly windows = new Map<string, { start: number; count: number }>();
  private lastSweep = Date.now();

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<Request>();
    const key = req.auth ? `s:${req.auth.sessionId}` : `i:${req.ip}`;
    const now = Date.now();
    this.sweep(now);

    let window = this.windows.get(key);
    if (!window || now - window.start >= WINDOW_MS) {
      window = { start: now, count: 0 };
      this.windows.set(key, window);
    }
    window.count += 1;
    if (window.count > config.rateLimitPerMinute) {
      throw new AppException(HttpStatus.TOO_MANY_REQUESTS, ErrorCode.RATE_LIMITED, {
        retryAfter: Math.ceil((window.start + WINDOW_MS - now) / 1000),
      });
    }
    return true;
  }

  /** Oublie les fenêtres terminées, une fois par minute au plus. */
  private sweep(now: number): void {
    if (now - this.lastSweep < WINDOW_MS) return;
    this.lastSweep = now;
    for (const [key, window] of this.windows) {
      if (now - window.start >= WINDOW_MS) this.windows.delete(key);
    }
  }
}
