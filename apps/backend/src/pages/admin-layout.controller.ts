import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { type AdminLayoutPart, type AssembledRow, LayoutKind } from '@strategos/shared';
import { Actor, type AuditActor } from '../audit/audit-actor.js';
import { CurrentAuth } from '../auth/decorators.js';
import type { AuthContext } from '../auth/request-context.js';
import { LayoutService } from './layout.service.js';
import { PreviewQueryDto, SaveLayoutDraftDto } from './pages.dto.js';

const kindPipe = new ParseEnumPipe(LayoutKind);

/** Header et footer partagés, côté admin. */
@Controller('admin/layout/:kind')
export class AdminLayoutController {
  constructor(private readonly layout: LayoutService) {}

  @Get('draft')
  get(@Param('kind', kindPipe) kind: LayoutKind): Promise<AdminLayoutPart> {
    return this.layout.get(kind);
  }

  @Put('draft')
  saveDraft(
    @Param('kind', kindPipe) kind: LayoutKind,
    @Body() dto: SaveLayoutDraftDto,
    @Actor() actor: AuditActor,
  ): Promise<AdminLayoutPart> {
    return this.layout.saveDraft(kind, dto, actor);
  }

  @Get('preview')
  preview(
    @Param('kind', kindPipe) kind: LayoutKind,
    @Query() query: PreviewQueryDto,
    @CurrentAuth() auth: AuthContext,
  ): Promise<AssembledRow[]> {
    return this.layout.preview(kind, auth.user, query.asGroup);
  }

  @HttpCode(HttpStatus.OK)
  @Post('publish')
  publish(
    @Param('kind', kindPipe) kind: LayoutKind,
    @Actor() actor: AuditActor,
  ): Promise<AdminLayoutPart> {
    return this.layout.publish(kind, actor);
  }
}
