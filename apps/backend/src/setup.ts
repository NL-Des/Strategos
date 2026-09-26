import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { createValidationPipe } from './common/validation.pipe.js';

/** Réglages communs au serveur et aux tests e2e. */
export function configureApp(app: NestExpressApplication): void {
  // Un seul proxy devant le backend (Caddy) : `req.ip` est l'adresse réelle du client.
  app.set('trust proxy', 1);
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
}
