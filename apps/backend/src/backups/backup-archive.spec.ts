import { describe, expect, it } from 'vitest';
import {
  archiveDate,
  archiveName,
  type BackupLike,
  selectExpired,
  pgTarget,
  toPgUrl,
} from './backup-archive.js';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-09-29T03:00:00Z');
const ago = (days: number) => new Date(now.getTime() - days * DAY);

describe('archiveName / archiveDate', () => {
  it('horodate en UTC et se relit', () => {
    const name = archiveName(new Date('2026-09-29T03:04:05.678Z'));
    expect(name).toBe('strategos-2026-09-29T03-04-05Z.tar.gz');
    expect(archiveDate(name)).toEqual(new Date('2026-09-29T03:04:05Z'));
  });

  it('ignore les autres fichiers', () => {
    expect(archiveDate('notes.txt')).toBeNull();
    expect(archiveDate('strategos-x.tar.gz.partial')).toBeNull();
  });
});

describe('toPgUrl', () => {
  it('retire les paramètres propres à Prisma et garde les autres', () => {
    expect(toPgUrl('postgresql://u:p@db:5432/base?schema=public&sslmode=require')).toBe(
      'postgresql://u:p@db:5432/base?sslmode=require',
    );
  });
});

describe('pgTarget', () => {
  it('sort le mot de passe de l’adresse et le passe par PGPASSWORD', () => {
    expect(pgTarget('postgresql://u:p%40ss@db:5432/base?schema=public')).toEqual({
      url: 'postgresql://u@db:5432/base',
      env: { PGPASSWORD: 'p@ss' },
    });
    expect(pgTarget('postgresql://u@db:5432/base')).toEqual({
      url: 'postgresql://u@db:5432/base',
      env: {},
    });
  });
});

describe('selectExpired', () => {
  const b = (id: string, days: number, status: BackupLike['status'] = 'ok'): BackupLike => ({
    id,
    status,
    createdAt: ago(days),
  });

  it('purge au-delà de la rétention', () => {
    const list = [b('recent', 1), b('limite', 6.9), b('vieux', 8), b('très-vieux', 30)];
    expect(selectExpired(list, 7, now).map((x) => x.id)).toEqual(['vieux', 'très-vieux']);
  });

  it('garde toujours la dernière sauvegarde réussie', () => {
    const list = [b('échec', 1, 'failed'), b('dernière-ok', 10), b('ancienne-ok', 20)];
    expect(selectExpired(list, 7, now).map((x) => x.id)).toEqual(['ancienne-ok']);
  });

  it('purge les échecs anciens, jamais une sauvegarde en cours', () => {
    const list = [b('ok', 1), b('échec', 9, 'failed'), b('en-cours', 9, 'running')];
    expect(selectExpired(list, 7, now).map((x) => x.id)).toEqual(['échec']);
  });
});
