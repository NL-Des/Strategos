import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { BackupService } from '../backups/backup.service.js';
import { CliModule } from './cli.module.js';

// Sauvegarde immédiate, sans attendre la tâche de la nuit (11) :
//   docker compose exec backend node dist/src/cli/run-backup.js
if (existsSync('.env')) process.loadEnvFile('.env');

const app = await NestFactory.createApplicationContext(CliModule, { logger: ['error'] });
try {
  const backup = await app.get(BackupService).run();
  if (backup?.status !== 'ok') {
    console.error(`Sauvegarde en échec : ${backup?.error ?? 'déjà en cours'}`);
    process.exitCode = 1;
  } else {
    console.log(`Sauvegarde créée (${backup.sizeBytes} octets).`);
  }
} finally {
  await app.close();
}
