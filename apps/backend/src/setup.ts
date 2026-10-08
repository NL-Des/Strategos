import type { NestExpressApplication } from '@nestjs/platform-express';
import { WsAdapter } from '@nestjs/platform-ws';
import cookieParser from 'cookie-parser';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { config } from './config.js';
import { createValidationPipe } from './common/validation.pipe.js';

/** Réglages communs au serveur et aux tests e2e. */
export function configureApp(app: NestExpressApplication): void {
  // Proxys devant le backend (Caddy seul par défaut) : `req.ip` est l'adresse réelle du client.
  app.set('trust proxy', config.trustProxy);
  // Une seule adresse par route : `/api/v1/Admin/users` n'existe pas. Nest a déjà
  // créé le routeur d'Express, qui ne relit pas le réglage : on le pose aussi sur lui.
  app.set('case sensitive routing', true);
  const { router } = app.getHttpAdapter().getInstance();
  (router as unknown as { caseSensitive: boolean }).caseSensitive = true;
  app.disable('x-powered-by');
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  // Passerelle WebSocket du chat (protocole `ws` natif, chemin `/api/v1/ws`).
  // Ici plutôt que dans `main.ts` seul, pour que les tests e2e l'aient aussi.
  app.useWebSocketAdapter(new WsAdapter(app));
  app.enableShutdownHooks();
}
