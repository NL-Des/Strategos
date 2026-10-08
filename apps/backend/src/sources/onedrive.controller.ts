import { Controller, Get, Query, Res } from '@nestjs/common';
import type { OneDriveItem, OneDriveStatus } from '@strategos/shared';
import type { Response } from 'express';
import { AdminOnly, CurrentAuth, Public } from '../auth/decorators.js';
import type { AuthContext } from '../auth/request-context.js';
import { OneDriveAuthService } from './connectors/onedrive-auth.service.js';
import { OneDriveConnector } from './connectors/onedrive.connector.js';
import { SourceUnavailableError, sourceException } from './source-errors.js';
import { BrowseQueryDto } from './sources.dto.js';

/** Connexion OneDrive de l'admin (13 — Sources). Les routes `admin/` portent `@AdminOnly()`. */
@Controller()
export class OneDriveController {
  constructor(
    private readonly auth: OneDriveAuthService,
    private readonly connector: OneDriveConnector,
  ) {}

  @AdminOnly()
  @Get('admin/onedrive/status')
  status(): Promise<OneDriveStatus> {
    return this.auth.status();
  }

  /** Démarre la connexion Microsoft (redirection). */
  @AdminOnly()
  @Get('admin/onedrive/connect')
  connect(@CurrentAuth() auth: AuthContext, @Res() res: Response): void {
    res.redirect(this.auth.connectUrl(auth.user.id));
  }

  /**
   * Retour de Microsoft. Le cookie de session (`SameSite=Strict`) n'est pas
   * envoyé par cette navigation venue d'un autre site : la route est publique et
   * ne se fie qu'au paramètre `state`, lié à l'admin qui a lancé la connexion.
   */
  @Public()
  @Get('onedrive/callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    try {
      await this.auth.callback(code, state);
      res.redirect('/admin/sources?onedrive=connected');
    } catch {
      res.redirect('/admin/sources?onedrive=failed');
    }
  }

  @AdminOnly()
  @Get('admin/onedrive/browse')
  async browse(@Query() query: BrowseQueryDto): Promise<OneDriveItem[]> {
    try {
      return await this.connector.browse(query.path);
    } catch (error) {
      if (error instanceof SourceUnavailableError) throw sourceException(error);
      throw error;
    }
  }
}
