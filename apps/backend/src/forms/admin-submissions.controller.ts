import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import type { Paginated, Submission, SubmissionQueueItem } from '@strategos/shared';
import { Actor, type AuditActor } from '../audit/audit-actor.js';
import { CurrentAuth } from '../auth/decorators.js';
import type { AuthContext } from '../auth/request-context.js';
import {
  ModifySubmissionDto,
  RejectSubmissionDto,
  SubmissionsQueryDto,
  ValidateSubmissionDto,
} from './forms.dto.js';
import { SubmissionProcessor } from './submission-processor.service.js';
import { SubmissionsService } from './submissions.service.js';

/** Tableau de bord des soumissions (04, 13). Protégé globalement par `AdminGuard`. */
@Controller('admin/submissions')
export class AdminSubmissionsController {
  constructor(
    private readonly submissions: SubmissionsService,
    private readonly processor: SubmissionProcessor,
  ) {}

  @Get()
  queue(@Query() query: SubmissionsQueryDto): Promise<Paginated<SubmissionQueueItem>> {
    return this.submissions.queue(query);
  }

  /** Compteur des soumissions en attente, affiché en permanence dans l'espace admin. */
  @Get('count')
  async count(): Promise<{ count: number }> {
    return { count: await this.submissions.pendingCount() };
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/validate')
  async validate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ValidateSubmissionDto,
    @CurrentAuth() auth: AuthContext,
    @Actor() actor: AuditActor,
  ): Promise<Submission> {
    await this.processor.validate(id, {
      actor,
      deciderId: auth.user.id,
      confirm: dto.confirm === true,
    });
    return this.submissions.one(id);
  }

  /** Valide avec des valeurs corrigées par l'admin → `modified`. */
  @HttpCode(HttpStatus.OK)
  @Post(':id/modify')
  async modify(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModifySubmissionDto,
    @CurrentAuth() auth: AuthContext,
    @Actor() actor: AuditActor,
  ): Promise<Submission> {
    await this.processor.validate(id, {
      actor,
      deciderId: auth.user.id,
      confirm: dto.confirm === true,
      values: dto.values,
    });
    return this.submissions.one(id);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/reject')
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectSubmissionDto,
    @CurrentAuth() auth: AuthContext,
    @Actor() actor: AuditActor,
  ): Promise<Submission> {
    await this.processor.reject(id, dto.reason?.trim() || null, auth.user.id, actor);
    return this.submissions.one(id);
  }
}
