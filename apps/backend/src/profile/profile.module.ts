import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GroupsModule } from '../groups/groups.module.js';
import { ProfileController } from './profile.controller.js';

/** Profil de l'utilisateur (05) : page administrative et mot de passe. */
@Module({
  imports: [AuthModule, GroupsModule],
  controllers: [ProfileController],
})
export class ProfileModule {}
