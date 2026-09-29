import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { config } from '../config.js';
import { toPgUrl } from './backup-archive.js';

const run = promisify(execFile);

/**
 * Restauration d'une archive (11 — Sauvegardes), par la commande serveur
 * seulement, backend arrêté : la base est remplacée par le contenu de
 * `db.dump` (en une transaction), puis le volume `uploads` par celui de l'archive.
 */
export async function restoreArchive(archive: string): Promise<void> {
  if (!(await stat(archive).catch(() => null))?.isFile()) {
    throw new Error(`Archive introuvable : ${archive}`);
  }
  const work = await mkdtemp(join(tmpdir(), 'strategos-restore-'));
  try {
    await run('tar', ['-xzf', archive, '-C', work]);
    const dump = join(work, 'db.dump');
    if (!(await stat(dump).catch(() => null))) {
      throw new Error("Cette archive n'est pas une sauvegarde Strategos (db.dump absent).");
    }
    await run(config.pgRestoreBin, [
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-privileges',
      '--single-transaction',
      '--exit-on-error',
      `--dbname=${toPgUrl(config.databaseUrl)}`,
      dump,
    ]);
    // Le dossier des fichiers est un point de montage : on vide son contenu sans le supprimer.
    await mkdir(config.uploadsDir, { recursive: true });
    for (const entry of await readdir(config.uploadsDir)) {
      await rm(join(config.uploadsDir, entry), { recursive: true, force: true });
    }
    const uploads = join(work, 'uploads');
    if (await stat(uploads).catch(() => null)) {
      await cp(uploads, config.uploadsDir, { recursive: true });
    }
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
