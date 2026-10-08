import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { config } from './config.js';
import { buildOpenApiDocument } from './openapi.js';
import { configureApp } from './setup.js';

// En local, lit apps/backend/.env ; en conteneur, l'environnement vient du Compose.
if (existsSync('.env')) process.loadEnvFile('.env');

const app = await NestFactory.create<NestExpressApplication>(AppModule);
configureApp(app);
// Spécification OpenAPI consultable en développement seulement : `/api/docs`.
if (config.isDevelopment) SwaggerModule.setup('api/docs', app, buildOpenApiDocument(app));
await app.listen(Number(process.env.PORT ?? 3000));
