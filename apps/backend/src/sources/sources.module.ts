import { Module } from '@nestjs/common';
import { AdminSourcesController } from './admin-sources.controller.js';
import { SourceDataService } from './source-data.service.js';
import { SourceWriteService } from './source-write.service.js';
import { SourcesService } from './sources.service.js';

/** ExcelSyncModule de l'architecture : sources, staging, liaisons et lecture (08). */
@Module({
  controllers: [AdminSourcesController],
  providers: [SourcesService, SourceDataService, SourceWriteService],
  exports: [SourcesService, SourceDataService, SourceWriteService],
})
export class SourcesModule {}
