import type { CookieOptions, Response } from 'express';
import { config } from '../config.js';
import { SESSION_COOKIE, SESSION_TTL_MS } from './auth.constants.js';

export function cookieOptions(): CookieOptions {
  return { httpOnly: true, sameSite: 'strict', secure: config.isProduction, path: '/' };
}

/** Pose le cookie de session pour 7 jours : à la connexion, puis à chaque prolongation. */
export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: SESSION_TTL_MS });
}
