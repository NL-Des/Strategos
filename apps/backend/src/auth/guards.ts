import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '@strategos/shared';
import type { Request, Response } from 'express';
import { AppException } from '../common/app-exception.js';
import { config } from '../config.js';
import { PRESESSION_COOKIE, SESSION_COOKIE } from './auth.constants.js';
import { setSessionCookie } from './cookies.js';
import { verifyCsrfToken } from './csrf.js';
import { ALLOW_PENDING_CREDENTIALS, IS_ADMIN, IS_PUBLIC } from './decorators.js';
import { SessionService } from './session.service.js';

// Guards globaux, dans l'ordre d'exécution (13 — Qui protège quoi).

function requestOf(context: ExecutionContext): Request {
  return context.switchToHttp().getRequest<Request>();
}

/**
 * Ces guards ne concernent que HTTP. La passerelle WebSocket du chat gère sa
 * propre authentification (cookie de session au handshake, `Origin` vérifié),
 * donc les guards se retirent des contextes non HTTP (`ws`).
 */
const isHttp = (context: ExecutionContext): boolean => context.getType() === 'http';

/**
 * Résout la session du cookie et l'attache à la requête ; ne refuse rien. Une
 * session prolongée renvoie son cookie, pour que l'expiration glisse aussi côté
 * navigateur.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!isHttp(context)) return true;
    const req = requestOf(context);
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string' && token) {
      req.auth = (await this.sessions.resolve(token)) ?? undefined;
      if (req.auth?.renewed) {
        setSessionCookie(context.switchToHttp().getResponse<Response>(), token);
      }
    }
    return true;
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Requêtes qui modifient des données : `Origin` autorisé et `X-CSRF-Token` valide. */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (!isHttp(context)) return true;
    const req = requestOf(context);
    if (SAFE_METHODS.has(req.method)) return true;

    const origin = req.headers.origin;
    const token = req.headers['x-csrf-token'];
    const presession: unknown = req.cookies?.[PRESESSION_COOKIE];
    const secret = req.auth?.csrfSecret ?? (typeof presession === 'string' ? presession : '');
    const valid =
      !!origin &&
      config.appOrigins.includes(origin) &&
      typeof token === 'string' &&
      !!secret &&
      verifyCsrfToken(secret, token);
    if (!valid) throw new AppException(HttpStatus.FORBIDDEN, ErrorCode.CSRF_INVALID);
    return true;
  }
}

/** Toute route exige une session, sauf celles marquées `@Public()`. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (!isHttp(context)) return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic || requestOf(context).auth) return true;
    throw new AppException(HttpStatus.UNAUTHORIZED, ErrorCode.UNAUTHENTICATED);
  }
}

/**
 * Identifiants temporaires : seules `auth/me`, `auth/change-credentials`, `auth/logout`
 * et les routes publiques (connexion, jeton CSRF) répondent.
 */
@Injectable()
export class CredentialsChangeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (!isHttp(context)) return true;
    const user = requestOf(context).auth?.user;
    if (!user?.mustChangeCredentials) return true;
    const targets = [context.getHandler(), context.getClass()];
    const allowed =
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets) ||
      this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_CREDENTIALS, targets);
    if (allowed) return true;
    throw new AppException(HttpStatus.FORBIDDEN, ErrorCode.CREDENTIALS_CHANGE_REQUIRED);
  }
}

/**
 * Les routes marquées `@AdminOnly()` (tout `/api/v1/admin/**`) sont réservées à
 * l'admin ; pour les autres, l'espace n'existe pas (`404`). La décision porte sur
 * le contrôleur exécuté, jamais sur le texte de l'adresse : le routeur et le
 * guard ne peuvent pas la lire différemment.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (!isHttp(context)) return true;
    const adminOnly = this.reflector.getAllAndOverride<boolean>(IS_ADMIN, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!adminOnly || requestOf(context).auth?.user.isAdmin) return true;
    throw new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);
  }
}
