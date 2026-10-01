import { Controller, Get, Query, Res } from '@nestjs/common';
import type { GooglePickerSession, GoogleStatus } from '@strategos/shared';
import type { Response } from 'express';
import { CurrentAuth, Public } from '../auth/decorators.js';
import type { AuthContext } from '../auth/request-context.js';
import { GoogleAuthService } from './connectors/google-auth.service.js';
import { SourceUnavailableError, sourceException } from './source-errors.js';

/** Connexion Google de l'admin (13 — Sources). Les routes `admin/` sont protégées par `AdminGuard`. */
@Controller()
export class GoogleController {
  constructor(private readonly auth: GoogleAuthService) {}

  @Get('admin/google/status')
  status(): Promise<GoogleStatus> {
    return this.auth.status();
  }

  /** Démarre la connexion Google (redirection). */
  @Get('admin/google/connect')
  connect(@CurrentAuth() auth: AuthContext, @Res() res: Response): void {
    res.redirect(this.auth.connectUrl(auth.user.id));
  }

  /**
   * Retour de Google. Le cookie de session (`SameSite=Strict`) n'est pas envoyé
   * par cette navigation venue d'un autre site : la route est publique et ne se
   * fie qu'au paramètre `state`, lié à l'admin qui a lancé la connexion.
   */
  @Public()
  @Get('google/callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    try {
      await this.auth.callback(code, state);
      res.redirect('/admin/sources?google=connected');
    } catch {
      res.redirect('/admin/sources?google=failed');
    }
  }

  /** Jeton court et identifiants du sélecteur de fichiers Google ; jamais le refresh token. */
  @Get('admin/google/picker')
  async picker(): Promise<GooglePickerSession> {
    try {
      return await this.auth.pickerSession();
    } catch (error) {
      if (error instanceof SourceUnavailableError) throw sourceException(error);
      throw error;
    }
  }
}
