import type { NestExpressApplication } from '@nestjs/platform-express';
import { WsAdapter } from '@nestjs/platform-ws';
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
  // Passerelle WebSocket du chat (protocole `ws` natif, chemin `/api/v1/ws`).
  // Ici plutôt que dans `main.ts` seul, pour que les tests e2e l'aient aussi.
  app.useWebSocketAdapter(new WsAdapter(app));
  app.enableShutdownHooks();
}
