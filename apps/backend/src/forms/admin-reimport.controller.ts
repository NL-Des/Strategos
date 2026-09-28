import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { EXCEL_MAX_BYTES, ErrorCode, type ReimportPreview } from '@strategos/shared';
import { Actor, type AuditActor } from '../audit/audit-actor.js';
import { AppException } from '../common/app-exception.js';
import { ReimportConfirmDto } from './forms.dto.js';
import { ReimportService } from './reimport.service.js';

/**
 * Réimport d'un Excel uploadé (13 — Sources). Rattaché aux formulaires : il
 * liste et réapplique des validations. Protégé globalement par `AdminGuard`.
 */
@Controller('admin/sources/:id/reimport')
export class AdminReimportController {
  constructor(private readonly reimport: ReimportService) {}

  /** Nouveau fichier (`multipart`, champ `file`) → jeton et validations qui seraient perdues. */
  @HttpCode(HttpStatus.OK)
  @Post('preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: EXCEL_MAX_BYTES, files: 1 } }))
  preview(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @Actor() actor: AuditActor,
  ): Promise<ReimportPreview> {
    if (!file) {
      throw new AppException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED, {
        fields: { file: ['isDefined'] },
      });
    }
    return this.reimport.preview(id, file, actor as AuditActor & { kind: 'user' });
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('confirm')
  async confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReimportConfirmDto,
    @Actor() actor: AuditActor,
  ): Promise<void> {
    await this.reimport.confirm(id, dto.reimportToken, dto.mode, actor);
  }
}
