import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PageAccessModule } from '../pages/page-access.module.js';
import { AdminChatController } from './admin-chat.controller.js';
import { ChatAccessService } from './chat-access.service.js';
import { ChatController } from './chat.controller.js';
import { ChatGateway } from './chat.gateway.js';
import { ChatMessagesService } from './chat-messages.service.js';
import { ChatRealtimeService } from './chat-realtime.service.js';
import { PageChatsService } from './page-chats.service.js';

/**
 * Chat temps réel (07) : passerelle WebSocket, historique, modération. Le chat
 * n'est pas une ressource du modèle de droits : l'accès passe par la lecture de
 * la page (`PageAccessModule`). `PageChatsService` (création des chats à la
 * publication) est exporté pour `PagesModule`.
 */
@Module({
  imports: [AuthModule, PageAccessModule],
  controllers: [ChatController, AdminChatController],
  providers: [
    ChatAccessService,
    ChatMessagesService,
    ChatRealtimeService,
    ChatGateway,
    PageChatsService,
  ],
  exports: [PageChatsService],
})
export class ChatModule {}
