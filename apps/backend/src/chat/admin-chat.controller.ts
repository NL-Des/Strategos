import { Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Actor, type AuditActor } from '../audit/audit-actor.js';
import { CurrentAuth } from '../auth/decorators.js';
import type { AuthContext } from '../auth/request-context.js';
import { ChatMessagesService } from './chat-messages.service.js';

/**
 * Modération du chat (13 — Discussions). Réservé à l'admin (contrôleur sous
 * `admin/`). Masquer ou rétablir un message : archivé, tracé au journal et
 * diffusé en temps réel.
 */
@Controller('admin')
export class AdminChatController {
  constructor(private readonly messages: ChatMessagesService) {}

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('chat-messages/:id/hide')
  async hide(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Actor() actor: AuditActor,
  ): Promise<void> {
    await this.messages.setHidden(id, auth.user, actor, true);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('chat-messages/:id/unhide')
  async unhide(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Actor() actor: AuditActor,
  ): Promise<void> {
    await this.messages.setHidden(id, auth.user, actor, false);
  }
}
