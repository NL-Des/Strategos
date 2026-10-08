/**
 * Règles pures des sauvegardes (11 — Sauvegardes) : nom des archives, adresse
 * de la base pour les outils PostgreSQL, choix des archives à purger.
 */

const PREFIX = 'strategos-';
const SUFFIX = '.tar.gz';

/** `strategos-2026-09-29T03-00-00Z.tar.gz` : horodatage UTC, sans `:` ni millisecondes. */
export function archiveName(date: Date): string {
  const stamp = date
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replaceAll(':', '-');
  return `${PREFIX}${stamp}${SUFFIX}`;
}

/** Date d'une archive d'après son nom ; `null` si le nom n'est pas celui d'une archive. */
export function archiveDate(name: string): Date | null {
  const match = /^strategos-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z\.tar\.gz$/.exec(name);
  if (!match) return null;
  const [, day, h, m, s] = match;
  return new Date(`${day}T${h}:${m}:${s}Z`);
}

/** Paramètres propres à Prisma, que `pg_dump` et `pg_restore` refusent. */
const PRISMA_PARAMS = [
  'schema',
  'connection_limit',
  'pool_timeout',
  'socket_timeout',
  'pgbouncer',
  'statement_cache_size',
  'sslaccept',
  'sslidentity',
];

export function toPgUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  for (const param of PRISMA_PARAMS) url.searchParams.delete(param);
  return url.toString();
}

/**
 * Adresse de la base pour `pg_dump` et `pg_restore`, **sans le mot de passe** :
 * un argument se lit dans la liste des processus, pas l'environnement d'un
 * autre processus. Le mot de passe passe donc par `PGPASSWORD`.
 */
export function pgTarget(databaseUrl: string): { url: string; env: NodeJS.ProcessEnv } {
  const url = new URL(toPgUrl(databaseUrl));
  const password = decodeURIComponent(url.password);
  url.password = '';
  return { url: url.toString(), env: password ? { PGPASSWORD: password } : {} };
}

export interface BackupLike {
  id: string;
  status: 'running' | 'ok' | 'failed';
  createdAt: Date;
}

/**
 * Sauvegardes à purger : créées il y a plus de `retentionDays` jours. La dernière
 * sauvegarde réussie est toujours gardée, même ancienne, pour qu'une série
 * d'échecs ne laisse jamais l'instance sans sauvegarde.
 */
export function selectExpired<T extends BackupLike>(
  backups: T[],
  retentionDays: number,
  now: Date,
): T[] {
  const limit = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  const latestOk = backups
    .filter((b) => b.status === 'ok')
    .reduce<T | null>((a, b) => (!a || b.createdAt > a.createdAt ? b : a), null);
  return backups.filter(
    (b) => b.createdAt.getTime() < limit && b.status !== 'running' && b !== latestOk,
  );
}
