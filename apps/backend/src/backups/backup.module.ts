import { Module } from '@nestjs/common';
import { AdminBackupsController } from './admin-backups.controller.js';
import { BackupService } from './backup.service.js';

/** Sauvegarde quotidienne, purge, téléchargement (11 — Sauvegardes). */
@Module({
  controllers: [AdminBackupsController],
  providers: [BackupService],
})
export class BackupModule {}
