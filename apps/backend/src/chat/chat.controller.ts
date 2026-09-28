import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import type { ChatMessageView } from '@strategos/shared';
import { CurrentAuth } from '../auth/decorators.js';
import type { AuthContext } from '../auth/request-context.js';
import { ChatMessagesService } from './chat-messages.service.js';
import { ChatHistoryQueryDto, EditChatMessageDto } from './chat.dto.js';

/**
 * Chat côté utilisateur (13 — Chat). L'accès suit la **lecture de la page** :
 * `ChatAccessService` renvoie `404` sur un chat illisible. L'envoi d'un message
 * passe par le WebSocket (voir `ChatGateway`), pas par REST.
 */
@Controller()
export class ChatController {
  constructor(private readonly messages: ChatMessagesService) {}

  @Get('chats/:blockId/messages')
  history(
    @Param('blockId', ParseUUIDPipe) blockId: string,
    @Query() query: ChatHistoryQueryDto,
    @CurrentAuth() auth: AuthContext,
  ): Promise<ChatMessageView[]> {
    return this.messages.history(blockId, auth.user, query);
  }

  @Put('chat-messages/:id')
  edit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditChatMessageDto,
    @CurrentAuth() auth: AuthContext,
  ): Promise<ChatMessageView> {
    return this.messages.edit(id, auth.user, dto.content);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('chat-messages/:id')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<void> {
    await this.messages.remove(id, auth.user);
  }
}
