import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../app.module.js';
import { buildOpenApiDocument } from '../openapi.js';
import { configureApp } from '../setup.js';

// Écrit la spécification OpenAPI générée depuis le code (`pnpm openapi`) :
//   node dist/src/cli/openapi.js [fichier]   (par défaut references/openapi.json)
// `preview` : modules analysés sans instancier les services, donc sans base.
const app = await NestFactory.create<NestExpressApplication>(AppModule, {
  preview: true,
  logger: false,
});
configureApp(app);
const target = resolve(process.argv[2] ?? '../../references/openapi.json');
writeFileSync(target, `${JSON.stringify(buildOpenApiDocument(app), null, 2)}\n`);
console.log(`Spécification OpenAPI écrite : ${target}`);
await app.close();
