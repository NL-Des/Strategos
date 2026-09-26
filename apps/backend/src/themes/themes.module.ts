import { Module } from '@nestjs/common';
import { AdminThemesController } from './admin-themes.controller.js';
import { ThemesService } from './themes.service.js';

@Module({
  controllers: [AdminThemesController],
  providers: [ThemesService],
  exports: [ThemesService],
})
export class ThemesModule {}
