import { Module } from '@nestjs/common';
import { PageAccessModule } from '../pages/page-access.module.js';
import { SourcesModule } from '../sources/sources.module.js';
import { AdminFormsController } from './admin-forms.controller.js';
import { AdminReimportController } from './admin-reimport.controller.js';
import { AdminSubmissionsController } from './admin-submissions.controller.js';
import { FormDataService } from './form-data.service.js';
import { FormReaderService } from './form-reader.service.js';
import { FormsController } from './forms.controller.js';
import { FormsService } from './forms.service.js';
import { PageFormsService } from './page-forms.service.js';
import { ReimportService } from './reimport.service.js';
import { SubmissionProcessor } from './submission-processor.service.js';
import { SubmissionsService } from './submissions.service.js';

/** Formulaires et soumissions (09) : l'unique voie d'écriture des utilisateurs. */
@Module({
  imports: [SourcesModule, PageAccessModule],
  controllers: [
    AdminFormsController,
    AdminSubmissionsController,
    AdminReimportController,
    FormsController,
  ],
  providers: [
    FormsService,
    FormDataService,
    FormReaderService,
    PageFormsService,
    ReimportService,
    SubmissionProcessor,
    SubmissionsService,
  ],
  exports: [FormsService, PageFormsService, SubmissionProcessor],
})
export class FormsModule {}
