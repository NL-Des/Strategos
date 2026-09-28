import { Module } from '@nestjs/common';
import { GroupsModule } from '../groups/groups.module.js';
import { AdminDiscussionsController } from './admin-discussions.controller.js';
import { AttachmentsService } from './attachments.service.js';
import { DiscussionsController } from './discussions.controller.js';
import { MessagesService } from './messages.service.js';
import { PageSpacesService } from './page-spaces.service.js';
import { SpaceAccessService } from './space-access.service.js';
import { TopicsService } from './topics.service.js';

/**
 * Espaces de discussion (07) : sujets, messages, pièces jointes et modération.
 * `PageSpacesService` (création des espaces à la publication) est exporté pour
 * `PagesModule`.
 */
@Module({
  imports: [GroupsModule],
  controllers: [DiscussionsController, AdminDiscussionsController],
  providers: [
    SpaceAccessService,
    TopicsService,
    MessagesService,
    AttachmentsService,
    PageSpacesService,
  ],
  exports: [PageSpacesService],
})
export class DiscussionsModule {}
