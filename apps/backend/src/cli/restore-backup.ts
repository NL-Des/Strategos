import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AuditAction, AuditTargetType } from '@strategos/shared';
import { CLI_ACTOR } from '../audit/audit-actor.js';
import { AuditService } from '../audit/audit.service.js';
import { BackupService } from '../backups/backup.service.js';
import { restoreArchive } from '../backups/restore.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CliModule } from './cli.module.js';

// Restauration d'une sauvegarde (11), backend arrêté :
//   docker compose stop backend
//   docker compose run --rm backend node dist/src/cli/restore-backup.js /data/backups/<archive>
//   docker compose start backend
if (existsSync('.env')) process.loadEnvFile('.env');

const file = process.argv[2];
if (!file) {
  console.error('Usage : node dist/src/cli/restore-backup.js <archive .tar.gz>');
  process.exit(1);
}
const archive = resolve(file);

try {
  await restoreArchive(archive);
} catch (error) {
  console.error(`Restauration impossible : ${(error as { stderr?: string }).stderr ?? error}`);
  process.exit(1);
}

const app = await NestFactory.createApplicationContext(CliModule, { logger: ['error'] });
try {
  const reindexed = await app.get(BackupService).reindex();
  const prisma = app.get(PrismaService);
  const audit = app.get(AuditService);
  await prisma.$transaction((tx) =>
    audit.record(tx, CLI_ACTOR, {
      action: AuditAction.BACKUP_RESTORE,
      targetType: AuditTargetType.BACKUP,
      after: { file: basename(archive) },
    }),
  );
  console.log(`Sauvegarde restaurée : ${basename(archive)}`);
  console.log(`Archives disponibles dans l'espace admin : ${reindexed} réinscrite(s).`);
} finally {
  await app.close();
}
