import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type { AdminForm, FormPrefill, SaveFormDraftResult, UserForm } from '@strategos/shared';
import { Actor, type AuditActor } from '../audit/audit-actor.js';
import { CurrentAuth } from '../auth/decorators.js';
import type { AuthContext } from '../auth/request-context.js';
import { FormReaderService } from './form-reader.service.js';
import { CreateFormDto, FormSettingsDto, PrefillQueryDto, SaveFormDraftDto } from './forms.dto.js';
import { FormsService } from './forms.service.js';

/** Formulaires, côté admin (13 — Formulaires et soumissions). Protégé globalement par `AdminGuard`. */
@Controller('admin/forms')
export class AdminFormsController {
  constructor(
    private readonly forms: FormsService,
    private readonly reader: FormReaderService,
  ) {}

  /** Formulaire rattaché à un bloc du brouillon d'une page. */
  @Post()
  create(@Body() dto: CreateFormDto, @Actor() actor: AuditActor): Promise<AdminForm> {
    return this.forms.create(dto, actor);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<AdminForm> {
    return this.forms.get(id);
  }

  @Put(':id/draft')
  saveDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveFormDraftDto,
    @Actor() actor: AuditActor,
  ): Promise<SaveFormDraftResult> {
    return this.forms.saveDraft(id, dto, actor);
  }

  /** Retire le bloc du brouillon ; effectif à la publication de la page. */
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: AuditActor) {
    await this.forms.remove(id, actor);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/open')
  open(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: AuditActor): Promise<AdminForm> {
    return this.forms.setOpen(id, true, actor);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/close')
  close(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: AuditActor): Promise<AdminForm> {
    return this.forms.setOpen(id, false, actor);
  }

  @Patch(':id/settings')
  settings(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FormSettingsDto,
    @Actor() actor: AuditActor,
  ): Promise<AdminForm> {
    return this.forms.settings(id, dto, actor);
  }

  /** Aperçu : le brouillon tel que le verra l'utilisateur (`formUrl` de l'aperçu de page). */
  @Get(':id/preview')
  preview(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<UserForm> {
    return this.reader.previewForm(id, auth.user);
  }

  @Get(':id/preview/prefill')
  previewPrefill(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PrefillQueryDto,
  ): Promise<FormPrefill> {
    return this.reader.previewPrefill(id, query.rowKey);
  }
}
