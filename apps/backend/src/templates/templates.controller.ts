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
  Query,
} from '@nestjs/common';
import type { InstantiateResult, TemplateSummary } from '@strategos/shared';
import { Actor, type AuditActor } from '../audit/audit-actor.js';
import { CurrentAuth } from '../auth/decorators.js';
import type { AuthContext } from '../auth/request-context.js';
import {
  CreateTemplateDto,
  InstantiateTemplateDto,
  ListTemplatesQueryDto,
} from './templates.dto.js';
import { TemplatesService } from './templates.service.js';

/** Modèles, côté admin (13 — Modèles). Protégé globalement par `AdminGuard`. */
@Controller('admin/templates')
export class AdminTemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  list(@Query() query: ListTemplatesQueryDto): Promise<TemplateSummary[]> {
    return this.templates.list(query.type);
  }

  @Post()
  create(
    @Body() dto: CreateTemplateDto,
    @CurrentAuth() auth: AuthContext,
    @Actor() actor: AuditActor,
  ): Promise<TemplateSummary> {
    return this.templates.create(dto, auth.user, actor);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: AuditActor): Promise<void> {
    await this.templates.remove(id, actor);
  }

  @Post(':id/instantiate')
  instantiate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InstantiateTemplateDto,
    @CurrentAuth() auth: AuthContext,
    @Actor() actor: AuditActor,
  ): Promise<InstantiateResult> {
    return this.templates.instantiate(id, dto, auth.user, actor);
  }
}
