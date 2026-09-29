import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { BackupSummary } from '@strategos/shared';
import { BackupService } from '../src/backups/backup.service.js';
import { restoreArchive } from '../src/backups/restore.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  adminClient,
  createTestApp,
  expectStatus,
  resetDatabase,
  TestClient,
  uid,
  userClient,
} from './helpers.js';

const DAY = 24 * 60 * 60 * 1000;

describe('Sauvegardes (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let backups: BackupService;
  let admin: TestClient;
  const saved = { ...process.env };

  beforeAll(async () => {
    // Faux outils PostgreSQL, dossiers temporaires : jamais les vrais volumes.
    process.env.PG_DUMP_BIN = join(import.meta.dirname, 'fake-pg-dump.sh');
    process.env.PG_RESTORE_BIN = join(import.meta.dirname, 'fake-pg-restore.sh');
    app = await createTestApp();
    prisma = app.get(PrismaService);
    backups = app.get(BackupService);
  });

  beforeEach(async () => {
    process.env.BACKUPS_DIR = mkdtempSync(join(tmpdir(), 'strategos-backups-'));
    process.env.UPLOADS_DIR = mkdtempSync(join(tmpdir(), 'strategos-uploads-'));
    delete process.env.FAKE_PG_FAIL;
    await resetDatabase(app);
    admin = await adminClient(app);
  });

  afterAll(async () => {
    process.env = saved;
    await app.close();
  });

  const archives = () => readdirSync(process.env.BACKUPS_DIR!);
  const listing = (archive: string) =>
    execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).split('\n').filter(Boolean);

  it('sauvegarde : dump de la base et fichiers uploadés, dans une archive', async () => {
    mkdirSync(join(process.env.UPLOADS_DIR!, 'media'));
    writeFileSync(join(process.env.UPLOADS_DIR!, 'media', 'carte.png'), 'image');

    const backup = await backups.run();
    expect(backup).toMatchObject({ status: 'ok', error: null });
    expect(backup!.sizeBytes).toBeGreaterThan(0);
    const [file] = archives();
    expect(file).toMatch(/^strategos-.*Z\.tar\.gz$/);
    expect(listing(join(process.env.BACKUPS_DIR!, file!))).toEqual(
      expect.arrayContaining(['db.dump', 'uploads/', 'uploads/media/carte.png']),
    );
    const row = await prisma.backup.findUniqueOrThrow({ where: { id: backup!.id } });
    expect(row.filePath).toBe(file);
  });

  it('échec de pg_dump : sauvegarde en échec, sans archive', async () => {
    process.env.FAKE_PG_FAIL = '1';
    const backup = await backups.run();
    expect(backup).toMatchObject({ status: 'failed' });
    expect(backup!.error).toContain('connection refused');
    expect(archives()).toEqual([]);
  });

  it('purge selon la rétention réglée, en gardant la dernière sauvegarde réussie', async () => {
    await prisma.setting.update({ where: { id: 1 }, data: { backupRetentionDays: 3 } });
    const old = (days: number, status: 'ok' | 'failed', filePath?: string) =>
      prisma.backup.create({
        data: {
          status,
          filePath: filePath ?? null,
          createdAt: new Date(Date.now() - days * DAY),
        },
      });
    for (const name of ['a.tar.gz', 'b.tar.gz']) {
      writeFileSync(join(process.env.BACKUPS_DIR!, name), 'x');
    }
    const recent = await old(1, 'ok', 'a.tar.gz');
    await old(5, 'ok', 'b.tar.gz');
    await old(10, 'failed');

    await backups.purge();
    expect((await prisma.backup.findMany()).map((b) => b.id)).toEqual([recent.id]);
    expect(archives()).toEqual(['a.tar.gz']);

    // Série d'échecs : la dernière sauvegarde réussie reste, même hors délai.
    await prisma.backup.update({
      where: { id: recent.id },
      data: { createdAt: new Date(Date.now() - 30 * DAY) },
    });
    await backups.purge();
    expect(await prisma.backup.count()).toBe(1);
  });

  it('liste et téléchargement en flux, réservés à l’admin', async () => {
    const backup = (await backups.run())!;
    process.env.FAKE_PG_FAIL = '1';
    const failed = (await backups.run())!;

    const list = await admin.get('/admin/backups');
    expectStatus(list, 200);
    expect((list.body as BackupSummary[]).map((b) => [b.id, b.status])).toEqual([
      [failed.id, 'failed'],
      [backup.id, 'ok'],
    ]);

    const download = await admin
      .get(`/admin/backups/${backup.id}/download`)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });
    expectStatus(download, 200);
    expect(download.headers['content-type']).toBe('application/gzip');
    expect(download.headers['content-disposition']).toMatch(/attachment; filename="strategos-/);
    expect((download.body as Buffer).length).toBe(backup.sizeBytes);

    expectStatus(await admin.get(`/admin/backups/${failed.id}/download`), 404);
    expectStatus(await admin.get(`/admin/backups/${uid()}/download`), 404);
    const kira = await userClient(app, admin, 'kira');
    expectStatus(await kira.get('/admin/backups'), 404);
    expectStatus(await kira.get(`/admin/backups/${backup.id}/download`), 404);
  });

  it('restauration : base par pg_restore, fichiers remplacés, archives réinscrites', async () => {
    const uploads = process.env.UPLOADS_DIR!;
    mkdirSync(join(uploads, 'media'));
    writeFileSync(join(uploads, 'media', 'carte.png'), 'image sauvegardée');
    const backup = (await backups.run())!;
    const archive = join(process.env.BACKUPS_DIR!, archives()[0]!);
    // Après la sauvegarde : un fichier modifié, un autre ajouté.
    writeFileSync(join(uploads, 'media', 'carte.png'), 'image modifiée');
    writeFileSync(join(uploads, 'nouveau.txt'), 'x');
    process.env.FAKE_PG_LOG = join(mkdtempSync(join(tmpdir(), 'strategos-pg-')), 'log');

    await restoreArchive(archive);
    const log = readFileSync(process.env.FAKE_PG_LOG, 'utf8');
    expect(log).toContain('--clean');
    expect(log).toContain('--single-transaction');
    expect(log).toContain('dump factice');
    expect(readdirSync(uploads)).toEqual(['media']);
    expect(readFileSync(join(uploads, 'media', 'carte.png'), 'utf8')).toBe('image sauvegardée');

    // La table des sauvegardes n'est pas dans le dump : les archives y sont réinscrites.
    await prisma.backup.deleteMany();
    expect(await backups.reindex()).toBe(1);
    expect(await backups.reindex()).toBe(0);
    const [row] = await prisma.backup.findMany();
    expect(row).toMatchObject({ status: 'ok', filePath: archives()[0] });
    expect(Number(row!.sizeBytes)).toBe(backup.sizeBytes);

    await expect(restoreArchive(join(uploads, 'absent.tar.gz'))).rejects.toThrow(/introuvable/);
  });
});
