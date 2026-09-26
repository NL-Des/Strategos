import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import type { AssembledLayout, AssembledPage } from '@strategos/shared';
import { CurrentAuth } from '../auth/decorators.js';
import type { AuthContext } from '../auth/request-context.js';
import { LayoutService } from './layout.service.js';
import { PagesService } from './pages.service.js';

/** Pages vues par les utilisateurs (13 — Navigation et pages). */
@Controller()
export class PagesController {
  constructor(
    private readonly pages: PagesService,
    private readonly layout: LayoutService,
  ) {}

  @Get('pages/:id')
  read(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<AssembledPage> {
    return this.pages.read(id, auth.user);
  }

  @Get('layout')
  readLayout(@CurrentAuth() auth: AuthContext): Promise<AssembledLayout> {
    return this.layout.read(auth.user);
  }
}
