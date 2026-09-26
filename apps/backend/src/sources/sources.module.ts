import { Module } from '@nestjs/common';
import { AdminSourcesController } from './admin-sources.controller.js';
import { SourceDataService } from './source-data.service.js';
import { SourcesService } from './sources.service.js';

/** ExcelSyncModule de l'architecture : sources, staging, liaisons et lecture (08). */
@Module({
  controllers: [AdminSourcesController],
  providers: [SourcesService, SourceDataService],
  exports: [SourcesService, SourceDataService],
})
export class SourcesModule {}
