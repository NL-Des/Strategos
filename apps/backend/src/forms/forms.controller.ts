import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import type { FormPrefill, Paginated, Submission, UserForm } from '@strategos/shared';
import { CurrentAuth } from '../auth/decorators.js';
import type { AuthContext } from '../auth/request-context.js';
import { PaginationQueryDto } from '../common/pagination.dto.js';
import { FormReaderService } from './form-reader.service.js';
import { PrefillQueryDto, SubmitFormDto } from './forms.dto.js';
import { SubmissionsService } from './submissions.service.js';

/**
 * Formulaires et soumissions côté utilisateur (13 — routes utilisateur). Le
 * droit de lecture de la page est vérifié par `PageAccessService` (formulaire
 * illisible ou non configuré → `404`).
 */
@Controller()
export class FormsController {
  constructor(
    private readonly reader: FormReaderService,
    private readonly submissions: SubmissionsService,
  ) {}

  @Get('forms/:id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() auth: AuthContext): Promise<UserForm> {
    return this.reader.userForm(id, auth.user);
  }

  /** Formulaire de ligne : valeurs actuelles de la ligne, pour pré-remplir. */
  @Get('forms/:id/prefill')
  prefill(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PrefillQueryDto,
    @CurrentAuth() auth: AuthContext,
  ): Promise<FormPrefill> {
    return this.reader.prefill(id, auth.user, query.rowKey);
  }

  @Post('forms/:id/submissions')
  submit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitFormDto,
    @CurrentAuth() auth: AuthContext,
  ): Promise<Submission> {
    return this.reader.submit(id, auth.user, dto);
  }

  @Get('me/submissions')
  mine(
    @Query() query: PaginationQueryDto,
    @CurrentAuth() auth: AuthContext,
  ): Promise<Paginated<Submission>> {
    return this.submissions.mine(auth.user.id, query.page, query.pageSize);
  }

  @Get('me/submissions/:id')
  mineOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<Submission> {
    return this.submissions.mineOne(auth.user.id, id);
  }
}
