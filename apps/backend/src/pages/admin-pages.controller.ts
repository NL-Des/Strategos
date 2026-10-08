import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type {
  AdminPage,
  AdminPageSummary,
  AssembledLayout,
  AssembledPage,
  PublishPreview,
  SavePageDraftResult,
} from '@strategos/shared';
import { Actor, type AuditActor } from '../audit/audit-actor.js';
import { AdminOnly, CurrentAuth } from '../auth/decorators.js';
import { ConfirmDto } from '../common/confirm.dto.js';
import type { AuthContext } from '../auth/request-context.js';
import { CreatePageDto, PreviewQueryDto, SavePageDraftDto } from './pages.dto.js';
import { LayoutService } from './layout.service.js';
import { PagesService } from './pages.service.js';

/** Page builder, côté admin (13 — Page builder). */
@AdminOnly()
@Controller('admin/pages')
export class AdminPagesController {
  constructor(
    private readonly pages: PagesService,
    private readonly layout: LayoutService,
  ) {}

  @Get()
  list(): Promise<AdminPageSummary[]> {
    return this.pages.list();
  }

  @Post()
  create(@Body() dto: CreatePageDto, @Actor() actor: AuditActor): Promise<AdminPage> {
    return this.pages.create(dto, actor);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<AdminPage> {
    return this.pages.get(id);
  }

  @Put(':id/draft')
  saveDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SavePageDraftDto,
    @Actor() actor: AuditActor,
  ): Promise<SavePageDraftResult> {
    return this.pages.saveDraft(id, dto, actor);
  }

  /** Header et footer publiés qui encadrent l'aperçu, éventuellement avec les droits d'un groupe. */
  @Get('preview/layout')
  previewLayout(
    @Query() query: PreviewQueryDto,
    @CurrentAuth() auth: AuthContext,
  ): Promise<AssembledLayout> {
    return this.layout.previewPublished(auth.user, query.asGroup);
  }

  @Get(':id/preview')
  preview(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PreviewQueryDto,
    @CurrentAuth() auth: AuthContext,
  ): Promise<AssembledPage> {
    return this.pages.preview(id, auth.user, query.asGroup);
  }

  /** Formulaires modifiés et soumissions qui seraient invalidées, avant de publier. */
  @Get(':id/publish/preview')
  publishPreview(@Param('id', ParseUUIDPipe) id: string): Promise<PublishPreview> {
    return this.pages.publishPreview(id);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/publish')
  publish(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmDto,
    @CurrentAuth() auth: AuthContext,
    @Actor() actor: AuditActor,
  ): Promise<AdminPage> {
    return this.pages.publish(id, auth.user, actor, dto.confirm === true);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: AuditActor) {
    await this.pages.remove(id, actor);
  }
}
