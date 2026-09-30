import { Module } from '@nestjs/common';
import { AdminSourcesController } from './admin-sources.controller.js';
import { GoogleAuthService } from './connectors/google-auth.service.js';
import { GsheetConnector } from './connectors/gsheet.connector.js';
import { OneDriveAuthService } from './connectors/onedrive-auth.service.js';
import { OneDriveConnector } from './connectors/onedrive.connector.js';
import { SourceConnectors } from './connectors/source-connectors.service.js';
import { OneDriveController } from './onedrive.controller.js';
import { SourceDataService } from './source-data.service.js';
import { SourceGridService } from './source-grid.service.js';
import { SourceWriteService } from './source-write.service.js';
import { SourcesService } from './sources.service.js';

/** Moteur Excel/Sheets (08) : sources, staging, liaisons, lecture et écriture. */
@Module({
  controllers: [AdminSourcesController, OneDriveController],
  providers: [
    SourcesService,
    SourceDataService,
    SourceGridService,
    SourceWriteService,
    SourceConnectors,
    GoogleAuthService,
    GsheetConnector,
    OneDriveAuthService,
    OneDriveConnector,
  ],
  exports: [SourcesService, SourceDataService, SourceWriteService],
})
export class SourcesModule {}
