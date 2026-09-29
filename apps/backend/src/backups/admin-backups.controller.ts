import { Controller, Get, Param, ParseUUIDPipe, StreamableFile } from '@nestjs/common';
import type { BackupSummary } from '@strategos/shared';
import { BackupService } from './backup.service.js';

/** Sauvegardes (11, 13 — Supervision). Protégé globalement par `AdminGuard`. */
@Controller('admin/backups')
export class AdminBackupsController {
  constructor(private readonly backups: BackupService) {}

  @Get()
  list(): Promise<BackupSummary[]> {
    return this.backups.list();
  }

  @Get(':id/download')
  download(@Param('id', ParseUUIDPipe) id: string): Promise<StreamableFile> {
    return this.backups.download(id);
  }
}
