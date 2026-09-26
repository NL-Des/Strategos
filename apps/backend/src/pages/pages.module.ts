import { Module } from '@nestjs/common';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { SourcesModule } from '../sources/sources.module.js';
import { ThemesModule } from '../themes/themes.module.js';
import { AdminBlocksController } from './admin-blocks.controller.js';
import { DataBlocksService } from './data-blocks.service.js';
import { AdminLayoutController } from './admin-layout.controller.js';
import { AdminPagesController } from './admin-pages.controller.js';
import { LayoutService } from './layout.service.js';
import { PageAccessService } from './page-access.service.js';
import { PagesController } from './pages.controller.js';
import { PagesService } from './pages.service.js';
import { ReaderContextService } from './reader-context.service.js';

@Module({
  imports: [ThemesModule, PermissionsModule, SourcesModule],
  controllers: [
    AdminPagesController,
    AdminLayoutController,
    AdminBlocksController,
    PagesController,
  ],
  providers: [
    PagesService,
    LayoutService,
    PageAccessService,
    ReaderContextService,
    DataBlocksService,
  ],
  exports: [PageAccessService],
})
export class PagesModule {}
