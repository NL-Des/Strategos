import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { cp, mkdir, mkdtemp, readdir, rename, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import { HttpStatus, Injectable, Logger, StreamableFile } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { type BackupSummary, BackupStatus, ErrorCode } from '@strategos/shared';
import { AppException } from '../common/app-exception.js';
import { config } from '../config.js';
import type { Backup } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { archiveDate, archiveName, pgTarget, selectExpired } from './backup-archive.js';

const run = promisify(execFile);
const notFound = () => new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);
/** Une sauvegarde encore « en cours » après ce délai a été interrompue (redémarrage). */
const STALE_RUNNING_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 7;

function toSummary(backup: Backup): BackupSummary {
  return {
    id: backup.id,
    status: backup.status,
    sizeBytes: backup.sizeBytes === null ? null : Number(backup.sizeBytes),
    error: backup.error,
    createdAt: backup.createdAt.toISOString(),
    finishedAt: backup.finishedAt?.toISOString() ?? null,
  };
}

/** Message d'erreur d'un outil externe : sa sortie d'erreur plutôt que la ligne de commande. */
export function toolError(error: unknown): string {
  const stderr = (error as { stderr?: unknown }).stderr;
  const text = typeof stderr === 'string' && stderr.trim() ? stderr : String(error);
  return text.trim().slice(0, 2000);
}

/**
 * Sauvegardes de l'instance (11 — Sauvegardes) : chaque nuit, `pg_dump` de la
 * base et copie du volume `uploads`, réunis dans une archive `.tar.gz` du volume
 * `backups` ; purge au-delà de la durée de conservation réglée par l'admin.
 */
@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async nightly(): Promise<void> {
    const backup = await this.run();
    if (backup?.status === BackupStatus.failed) {
      this.logger.error(`Sauvegarde en échec : ${backup.error}`);
    }
  }

  /**
   * Crée une sauvegarde, puis purge les anciennes. `null` si une sauvegarde est
   * déjà en cours dans ce processus.
   */
  async run(): Promise<BackupSummary | null> {
    if (this.running) return null;
    this.running = true;
    try {
      const backup = await this.prisma.backup.create({ data: {} });
      const finished = await this.archive(backup);
      await this.purge();
      return toSummary(finished);
    } finally {
      this.running = false;
    }
  }

  private async archive(backup: Backup): Promise<Backup> {
    const name = archiveName(backup.createdAt);
    const target = join(config.backupsDir, name);
    const partial = `${target}.partial`;
    const work = await mkdtemp(join(tmpdir(), 'strategos-backup-'));
    try {
      const pg = pgTarget(config.databaseUrl);
      await run(
        config.pgDumpBin,
        [
          '--format=custom',
          '--no-owner',
          // La table des sauvegardes décrit le volume `backups`, pas l'état à restaurer.
          '--exclude-table-data=backups',
          `--file=${join(work, 'db.dump')}`,
          `--dbname=${pg.url}`,
        ],
        { env: { ...process.env, ...pg.env } },
      );
      await mkdir(join(work, 'uploads'));
      await cp(config.uploadsDir, join(work, 'uploads'), { recursive: true, force: true }).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') throw error;
        },
      );
      await mkdir(config.backupsDir, { recursive: true });
      await run('tar', ['-czf', partial, '-C', work, 'db.dump', 'uploads']);
      await rename(partial, target);
      const { size } = await stat(target);
      return await this.prisma.backup.update({
        where: { id: backup.id },
        data: {
          status: BackupStatus.ok,
          filePath: name,
          sizeBytes: size,
          finishedAt: new Date(),
        },
      });
    } catch (error) {
      await rm(partial, { force: true });
      return this.prisma.backup.update({
        where: { id: backup.id },
        data: { status: BackupStatus.failed, error: toolError(error), finishedAt: new Date() },
      });
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }

  /** Supprime archives et lignes au-delà de la durée de conservation (7 jours par défaut). */
  async purge(now = new Date()): Promise<void> {
    await this.prisma.backup.updateMany({
      where: {
        status: BackupStatus.running,
        createdAt: { lt: new Date(now.getTime() - STALE_RUNNING_MS) },
      },
      data: { status: BackupStatus.failed, error: 'Sauvegarde interrompue.', finishedAt: now },
    });
    const settings = await this.prisma.setting.findUnique({ where: { id: 1 } });
    const retention = settings?.backupRetentionDays ?? DEFAULT_RETENTION_DAYS;
    const expired = selectExpired(await this.prisma.backup.findMany(), retention, now);
    for (const backup of expired) {
      if (backup.filePath) {
        await rm(join(config.backupsDir, basename(backup.filePath)), { force: true });
      }
      await this.prisma.backup.delete({ where: { id: backup.id } });
    }
  }

  /**
   * Après une restauration, la table des sauvegardes est vide (elle n'est pas
   * sauvegardée) : les archives présentes dans le volume y sont réinscrites.
   */
  async reindex(): Promise<number> {
    const files = await readdir(config.backupsDir).catch(() => [] as string[]);
    const known = new Set(
      (await this.prisma.backup.findMany({ select: { filePath: true } })).map((b) => b.filePath),
    );
    let added = 0;
    for (const file of files) {
      const createdAt = archiveDate(file);
      if (!createdAt || known.has(file)) continue;
      const { size } = await stat(join(config.backupsDir, file));
      await this.prisma.backup.create({
        data: {
          status: BackupStatus.ok,
          filePath: file,
          sizeBytes: size,
          createdAt,
          finishedAt: createdAt,
        },
      });
      added++;
    }
    return added;
  }

  async list(): Promise<BackupSummary[]> {
    const backups = await this.prisma.backup.findMany({ orderBy: { createdAt: 'desc' } });
    return backups.map(toSummary);
  }

  /** Archive d'une sauvegarde réussie, en flux ; absente ou pas terminée → `404`. */
  async download(id: string): Promise<StreamableFile> {
    const backup = await this.prisma.backup.findUnique({ where: { id } });
    if (!backup || backup.status !== BackupStatus.ok || !backup.filePath) throw notFound();
    const name = basename(backup.filePath);
    const path = join(config.backupsDir, name);
    const info = await stat(path).catch(() => null);
    if (!info) throw notFound();
    return new StreamableFile(createReadStream(path), {
      type: 'application/gzip',
      disposition: `attachment; filename="${name}"`,
      length: info.size,
    });
  }
}
