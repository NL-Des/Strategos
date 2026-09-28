import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import type { TopicDetail } from '@strategos/shared';
import { Actor, type AuditActor } from '../audit/audit-actor.js';
import { CurrentAuth } from '../auth/decorators.js';
import type { AuthContext } from '../auth/request-context.js';
import { PinTopicDto } from './discussions.dto.js';
import { MessagesService } from './messages.service.js';
import { TopicsService } from './topics.service.js';

/**
 * Modération des discussions (13 — Discussions). Réservé à l'admin (contrôleur
 * sous `admin/`). Renommer et clore passent par la route utilisateur, ouverte à
 * l'admin ; seul l'épinglage et le masquage sont ici.
 */
@Controller('admin')
export class AdminDiscussionsController {
  constructor(
    private readonly topics: TopicsService,
    private readonly messages: MessagesService,
  ) {}

  @Patch('topics/:id')
  pin(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PinTopicDto,
    @CurrentAuth() auth: AuthContext,
  ): Promise<TopicDetail> {
    return this.topics.setPinned(id, auth.user, dto.pinned);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('messages/:id/hide')
  async hide(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Actor() actor: AuditActor,
  ): Promise<void> {
    await this.messages.setHidden(id, auth.user, actor, true);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('messages/:id/unhide')
  async unhide(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Actor() actor: AuditActor,
  ): Promise<void> {
    await this.messages.setHidden(id, auth.user, actor, false);
  }
}
