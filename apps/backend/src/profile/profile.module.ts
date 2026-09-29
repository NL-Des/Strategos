import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GroupsModule } from '../groups/groups.module.js';
import { AdminUserNotesController, NotesController } from './notes.controller.js';
import { NotesService } from './notes.service.js';
import { ProfileController } from './profile.controller.js';

/** Profil de l'utilisateur (05) : page administrative, mot de passe et notes. */
@Module({
  imports: [AuthModule, GroupsModule],
  controllers: [ProfileController, NotesController, AdminUserNotesController],
  providers: [NotesService],
})
export class ProfileModule {}
