import { Global, Module } from '@nestjs/common';
import { AdminSettingsController } from './admin-settings.controller.js';
import { SettingsService } from './settings.service.js';

/** Global : la page d'arrivée sert à `auth/me`. */
@Global()
@Module({
  controllers: [AdminSettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
