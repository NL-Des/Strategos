import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './setup.js';

// En local, lit apps/backend/.env ; en conteneur, l'environnement vient du Compose.
if (existsSync('.env')) process.loadEnvFile('.env');

const app = await NestFactory.create(AppModule);
configureApp(app);
await app.listen(Number(process.env.PORT ?? 3000));
