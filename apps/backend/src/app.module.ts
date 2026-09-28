import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { FormsModule } from './forms/forms.module.js';
import { GroupsModule } from './groups/groups.module.js';
import { HealthController } from './health/health.controller.js';
import { MediaModule } from './media/media.module.js';
import { PagesModule } from './pages/pages.module.js';
import { PermissionsModule } from './permissions/permissions.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProfileModule } from './profile/profile.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { SourcesModule } from './sources/sources.module.js';
import { ThemesModule } from './themes/themes.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    AuditModule,
    SettingsModule,
    AuthModule,
    UsersModule,
    GroupsModule,
    PermissionsModule,
    ProfileModule,
    ThemesModule,
    SourcesModule,
    FormsModule,
    PagesModule,
    MediaModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
