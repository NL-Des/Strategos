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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ErrorCode, MEDIA_MAX_BYTES, type MediaItem, type Paginated } from '@strategos/shared';
import { Actor, type AuditActor } from '../audit/audit-actor.js';
import { AppException } from '../common/app-exception.js';
import { ConfirmDto } from '../common/confirm.dto.js';
import { ListMediaQueryDto, UploadMediaDto } from './media.dto.js';
import { MediaService } from './media.service.js';

/** Ce que l'intercepteur fournit d'un fichier envoyé. */
interface UploadedImage {
  buffer: Buffer;
  originalname: string;
}

/** Médiathèque, côté admin. */
@Controller('admin/media')
export class AdminMediaController {
  constructor(private readonly media: MediaService) {}

  @Get()
  list(@Query() query: ListMediaQueryDto): Promise<Paginated<MediaItem>> {
    return this.media.list(query);
  }

  /** Upload `multipart/form-data` : champ `file`, champ `alt` facultatif. */
  @Post()
  // Sans destination configurée, le fichier reste en mémoire (`file.buffer`).
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MEDIA_MAX_BYTES, files: 1 } }))
  upload(
    @UploadedFile() file: UploadedImage | undefined,
    @Body() dto: UploadMediaDto,
    @Actor() actor: AuditActor,
  ): Promise<MediaItem> {
    if (!file) {
      throw new AppException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED, {
        fields: { file: ['isDefined'] },
      });
    }
    return this.media.upload(file, dto.alt, actor as AuditActor & { kind: 'user' });
  }

  @Get(':id/usages')
  usages(@Param('id', ParseUUIDPipe) id: string) {
    return this.media.usages(id);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmDto,
    @Actor() actor: AuditActor,
  ): Promise<void> {
    await this.media.remove(id, dto.confirm === true, actor);
  }
}
