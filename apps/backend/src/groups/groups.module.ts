import { Module } from '@nestjs/common';
import { AdminGroupsController } from './admin-groups.controller.js';
import { AdminRightsController } from './admin-rights.controller.js';
import { GroupsService } from './groups.service.js';
import { RightsService } from './rights.service.js';

/** Groupes, appartenances et calcul des droits effectifs (03). */
@Module({
  controllers: [AdminGroupsController, AdminRightsController],
  providers: [GroupsService, RightsService],
  exports: [GroupsService, RightsService],
})
export class GroupsModule {}
