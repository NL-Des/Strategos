import { Module } from '@nestjs/common';
import { GroupsModule } from '../groups/groups.module.js';
import { PermissionsGuard } from './permissions.guard.js';

/** `PermissionsGuard` : vérifie les droits, n'écrit rien. */
@Module({
  imports: [GroupsModule],
  providers: [PermissionsGuard],
  exports: [PermissionsGuard, GroupsModule],
})
export class PermissionsModule {}
