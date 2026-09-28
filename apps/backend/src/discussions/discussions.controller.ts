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
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  type AttachmentRef,
  ATTACHMENT_MAX_BYTES,
  ErrorCode,
  type Paginated,
  type TopicDetail,
  type TopicMessageView,
  type TopicSummary,
  type TopicWithMessages,
} from '@strategos/shared';
import type { Response } from 'express';
import { CurrentAuth } from '../auth/decorators.js';
import type { AuthContext } from '../auth/request-context.js';
import { AppException } from '../common/app-exception.js';
import { PaginationQueryDto } from '../common/pagination.dto.js';
import { AttachmentsService } from './attachments.service.js';
import { EditMessageDto, OpenTopicDto, PatchTopicDto, PostMessageDto } from './discussions.dto.js';
import { MessagesService } from './messages.service.js';
import { TopicsService } from './topics.service.js';

/** Ce que l'intercepteur fournit d'un fichier envoyé. */
interface UploadedImage {
  buffer: Buffer;
}

/**
 * Espaces de discussion côté utilisateur (13 — Espaces de discussion). Les droits
 * sont vérifiés sur l'espace (`space_id`) par `SpaceAccessService` : espace
 * illisible → `404`.
 */
@Controller()
export class DiscussionsController {
  constructor(
    private readonly topics: TopicsService,
    private readonly messages: MessagesService,
    private readonly attachments: AttachmentsService,
  ) {}

  @Get('spaces/:id/topics')
  listTopics(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
    @CurrentAuth() auth: AuthContext,
  ): Promise<Paginated<TopicSummary>> {
    return this.topics.listTopics(id, auth.user, query);
  }

  @Post('spaces/:id/topics')
  openTopic(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OpenTopicDto,
    @CurrentAuth() auth: AuthContext,
  ): Promise<TopicDetail> {
    return this.topics.openTopic(id, auth.user, dto);
  }

  @Get('topics/:id')
  getTopic(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
    @CurrentAuth() auth: AuthContext,
  ): Promise<TopicWithMessages> {
    return this.topics.getTopic(id, auth.user, query);
  }

  @Patch('topics/:id')
  patchTopic(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PatchTopicDto,
    @CurrentAuth() auth: AuthContext,
  ): Promise<TopicDetail> {
    return this.topics.patchTopic(id, auth.user, dto);
  }

  @Post('topics/:id/messages')
  postMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PostMessageDto,
    @CurrentAuth() auth: AuthContext,
  ): Promise<TopicMessageView> {
    return this.messages.post(id, auth.user, dto);
  }

  @Put('messages/:id')
  editMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditMessageDto,
    @CurrentAuth() auth: AuthContext,
  ): Promise<TopicMessageView> {
    return this.messages.edit(id, auth.user, dto.content);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('messages/:id')
  async deleteMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<void> {
    await this.messages.remove(id, auth.user);
  }

  /** Upload d'une image jointe (`multipart`), à rattacher ensuite à un message. */
  @Post('attachments')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: ATTACHMENT_MAX_BYTES, files: 1 } }),
  )
  uploadAttachment(
    @UploadedFile() file: UploadedImage | undefined,
    @CurrentAuth() auth: AuthContext,
  ): Promise<AttachmentRef> {
    if (!file) {
      throw new AppException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED, {
        fields: { file: ['isDefined'] },
      });
    }
    return this.attachments.upload(file, auth.user);
  }

  @Get('attachments/:id')
  async getAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Res() res: Response,
  ): Promise<void> {
    const { path, mime } = await this.attachments.file(id, auth.user);
    res.sendFile(path, {
      headers: {
        'Content-Type': mime,
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'",
      },
    });
  }
}
