import { Module } from '@nestjs/common';
import { AdminTemplatesController } from './templates.controller.js';
import { TemplatesService } from './templates.service.js';

/** Bibliothèque de modèles (10) : formulaires, pages et sujets. */
@Module({
  controllers: [AdminTemplatesController],
  providers: [TemplatesService],
})
export class TemplatesModule {}
