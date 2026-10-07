import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  type AddSourceInput,
  type GridCell,
  EXCEL_MAX_BYTES,
  EXCEL_MIME,
  ErrorCode,
  type SourceGrid,
  type SourceScript,
  type SourceSummary,
} from '@strategos/shared';
import type { Response } from 'express';
import { Actor, type AuditActor } from '../audit/audit-actor.js';
import { AppException } from '../common/app-exception.js';
import { ConfirmDto } from '../common/confirm.dto.js';
import { SourceGridService } from './source-grid.service.js';
import { AddSourceDto, CellEditDto, GridQueryDto } from './sources.dto.js';
import { SourcesService } from './sources.service.js';

/** Sources de données, côté admin (13 — Sources). Protégé globalement par `AdminGuard`. */
@Controller('admin/sources')
export class AdminSourcesController {
  constructor(
    private readonly sources: SourcesService,
    private readonly grid: SourceGridService,
  ) {}

  @Get()
  list(): Promise<SourceSummary[]> {
    return this.sources.list();
  }

  /**
   * Ajouter un Google Sheet `{ type: "gsheet", spreadsheetId }`, un fichier OneDrive
   * `{ type: "onedrive", itemId }`, un Google Sheet par lien public `{ type: "gsheet_link", url }`
   * ou un Google Sheet relié par un script `{ type: "gsheet_script", scriptUrl, secret }`.
   */
  @Post()
  add(@Body() dto: AddSourceDto, @Actor() actor: AuditActor): Promise<SourceSummary> {
    return this.sources.add(dto as AddSourceInput, actor as AuditActor & { kind: 'user' });
  }

  /** Script Apps Script à coller dans un Sheet, avec un secret neuf. */
  @HttpCode(HttpStatus.OK)
  @Post('script')
  newScript(): SourceScript {
    return this.sources.newScript();
  }

  /** Script à jour d'un Google Sheet déjà relié par un script, pour le recoller. */
  @Get(':id/script')
  script(@Param('id', ParseUUIDPipe) id: string): Promise<SourceScript> {
    return this.sources.script(id);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/test')
  test(@Param('id', ParseUUIDPipe) id: string): Promise<SourceSummary> {
    return this.sources.test(id);
  }

  /** Upload `multipart/form-data` d'un `.xlsx` (champ `file`) → nouvelle source. */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: EXCEL_MAX_BYTES, files: 1 } }))
  upload(
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
    @Actor() actor: AuditActor,
  ): Promise<SourceSummary> {
    if (!file) {
      throw new AppException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED, {
        fields: { file: ['isDefined'] },
      });
    }
    return this.sources.upload(file, actor as AuditActor & { kind: 'user' });
  }

  /** Version de référence d'un Excel uploadé ; le téléchargement est tracé. */
  @Get(':id/download')
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: AuditActor,
    @Res() res: Response,
  ): Promise<void> {
    const { content, name } = await this.sources.download(id, actor);
    res.attachment(name).type(EXCEL_MIME).send(content);
  }

  /** Fenêtre de la grille d'un Excel uploadé ou d'un Google Sheet (compte connecté ou script). */
  @Get(':id/cells')
  cells(@Param('id', ParseUUIDPipe) id: string, @Query() query: GridQueryDto): Promise<SourceGrid> {
    return this.grid.window(id, query);
  }

  /** Modifier une cellule : valeur ou formule (`=…`), comme dans un tableur. */
  @Patch(':id/cells')
  editCell(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CellEditDto,
    @Actor() actor: AuditActor,
  ): Promise<GridCell> {
    return this.grid.edit(id, dto, actor);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmDto,
    @Actor() actor: AuditActor,
  ): Promise<void> {
    await this.sources.remove(id, dto.confirm === true, actor);
  }
}
