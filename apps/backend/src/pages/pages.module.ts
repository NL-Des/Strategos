import { Module } from '@nestjs/common';
import { ThemesModule } from '../themes/themes.module.js';
import { AdminLayoutController } from './admin-layout.controller.js';
import { AdminPagesController } from './admin-pages.controller.js';
import { LayoutService } from './layout.service.js';
import { PageAccessService } from './page-access.service.js';
import { PagesController } from './pages.controller.js';
import { PagesService } from './pages.service.js';
import { ReaderContextService } from './reader-context.service.js';

@Module({
  imports: [ThemesModule],
  controllers: [AdminPagesController, AdminLayoutController, PagesController],
  providers: [PagesService, LayoutService, PageAccessService, ReaderContextService],
  exports: [PageAccessService],
})
export class PagesModule {}
