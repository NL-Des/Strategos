import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { UsersService } from '../users/users.service.js';
import { CliModule } from './cli.module.js';

// Récupération du compte admin (02) :
//   docker compose exec backend node dist/src/cli/reset-admin.js
if (existsSync('.env')) process.loadEnvFile('.env');

const app = await NestFactory.createApplicationContext(CliModule, { logger: ['error'] });
try {
  const { username, temporaryPassword } = await app.get(UsersService).resetAdmin();
  console.log(`Compte administrateur : ${username}`);
  console.log(`Mot de passe temporaire : ${temporaryPassword}`);
  console.log('Il devra être changé à la prochaine connexion.');
} finally {
  await app.close();
}
