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
} from '@nestjs/common';
import type { AdminPage, AdminPageSummary, AssembledPage } from '@strategos/shared';
import { Actor, type AuditActor } from '../audit/audit-actor.js';
import { CurrentAuth } from '../auth/decorators.js';
import type { AuthContext } from '../auth/request-context.js';
import { CreatePageDto, SavePageDraftDto } from './pages.dto.js';
import { PagesService } from './pages.service.js';

/** Page builder, côté admin (13 — Page builder). */
@Controller('admin/pages')
export class AdminPagesController {
  constructor(private readonly pages: PagesService) {}

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
  ): Promise<AdminPage> {
    return this.pages.saveDraft(id, dto, actor);
  }

  @Get(':id/preview')
  preview(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<AssembledPage> {
    return this.pages.preview(id, auth.user);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/publish')
  publish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Actor() actor: AuditActor,
  ): Promise<AdminPage> {
    return this.pages.publish(id, auth.user, actor);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: AuditActor) {
    await this.pages.remove(id, actor);
  }
}
