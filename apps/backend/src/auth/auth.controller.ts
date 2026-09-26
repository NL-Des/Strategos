import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import type { Me } from '@strategos/shared';
import type { CookieOptions, Request, Response } from 'express';
import { config } from '../config.js';
import { SettingsService } from '../settings/settings.service.js';
import { toMe } from '../users/user.mapper.js';
import { PRESESSION_COOKIE, SESSION_COOKIE, SESSION_TTL_MS } from './auth.constants.js';
import { ChangeCredentialsDto, LoginDto } from './auth.dto.js';
import { AuthService, type ClientMeta } from './auth.service.js';
import { deriveCsrfToken, randomSecret } from './csrf.js';
import { AllowPendingCredentials, CurrentAuth, Public } from './decorators.js';
import type { AuthContext } from './request-context.js';
import { SessionService } from './session.service.js';

function cookieOptions(): CookieOptions {
  return { httpOnly: true, sameSite: 'strict', secure: config.isProduction, path: '/' };
}

export function clientMeta(req: Request): ClientMeta {
  return { ip: req.ip ?? '0.0.0.0', userAgent: req.headers['user-agent'] };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly settings: SettingsService,
  ) {}

  /** Jeton CSRF de la session, ou d'une pré-session pour le formulaire de connexion. */
  @Public()
  @Get('csrf')
  csrf(@Req() req: Request, @Res({ passthrough: true }) res: Response): { csrfToken: string } {
    if (req.auth) return { csrfToken: deriveCsrfToken(req.auth.csrfSecret) };

    const existing: unknown = req.cookies?.[PRESESSION_COOKIE];
    const secret = typeof existing === 'string' && existing ? existing : randomSecret();
    res.cookie(PRESESSION_COOKIE, secret, cookieOptions());
    return { csrfToken: deriveCsrfToken(secret) };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Me> {
    const { user, token } = await this.auth.login(dto, clientMeta(req), req.auth?.sessionId);
    res.clearCookie(PRESESSION_COOKIE, cookieOptions());
    res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: SESSION_TTL_MS });
    return toMe(user, await this.settings.landingPageId());
  }

  @AllowPendingCredentials()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(
    @CurrentAuth() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.sessions.revoke(auth.sessionId);
    res.clearCookie(SESSION_COOKIE, cookieOptions());
  }

  @AllowPendingCredentials()
  @Get('me')
  async me(@CurrentAuth() auth: AuthContext): Promise<Me> {
    return toMe(auth.user, await this.settings.landingPageId());
  }

  @AllowPendingCredentials()
  @HttpCode(HttpStatus.OK)
  @Post('change-credentials')
  async changeCredentials(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: ChangeCredentialsDto,
    @Req() req: Request,
  ): Promise<Me> {
    const user = await this.auth.changeCredentials(auth, dto, clientMeta(req));
    return toMe(user, await this.settings.landingPageId());
  }
}
