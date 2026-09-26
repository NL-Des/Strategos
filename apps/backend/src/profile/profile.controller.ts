import { Body, Controller, Get, HttpCode, HttpStatus, Put, Req } from '@nestjs/common';
import type { Profile } from '@strategos/shared';
import type { Request } from 'express';
import { clientMeta } from '../auth/auth.controller.js';
import { ChangePasswordDto } from '../auth/auth.dto.js';
import { AuthService } from '../auth/auth.service.js';
import { CurrentAuth } from '../auth/decorators.js';
import type { AuthContext } from '../auth/request-context.js';
import { RightsService } from '../groups/rights.service.js';

/**
 * Profil (05) : accès par propriété, la session désigne le compte ; jamais par
 * `PermissionsGuard` ni par les groupes.
 */
@Controller('me')
export class ProfileController {
  constructor(
    private readonly auth: AuthService,
    private readonly rights: RightsService,
  ) {}

  /** Page administrative : même calcul des droits que la vue admin « par utilisateur ». */
  @Get('profile')
  async profile(@CurrentAuth() auth: AuthContext): Promise<Profile> {
    const { user } = auth;
    return {
      id: user.id,
      username: user.username,
      createdAt: user.createdAt.toISOString(),
      status: user.disabledAt ? 'disabled' : 'active',
      rights: await this.rights.userRights(user.id),
    };
  }

  /** Nouveau mot de passe, en saisissant l'ancien ; les autres sessions sont fermées. */
  @HttpCode(HttpStatus.NO_CONTENT)
  @Put('password')
  async changePassword(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.auth.changePassword(auth, dto, clientMeta(req));
  }
}
