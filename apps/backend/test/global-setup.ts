import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';

/**
 * Prépare la base de test : la crée si besoin, puis applique les migrations.
 * URL : TEST_DATABASE_URL, sinon la base locale `strategos_test` de `pnpm db:up`.
 */
export default async function setup(): Promise<void> {
  const url =
    process.env.TEST_DATABASE_URL ??
    'postgresql://strategos:strategos@localhost:5432/strategos_test';
  process.env.DATABASE_URL = url;
  // Fichiers envoyés pendant les tests : dossier temporaire, jamais le vrai volume.
  process.env.UPLOADS_DIR = mkdtempSync(join(tmpdir(), 'strategos-uploads-'));

  const target = new URL(url);
  const database = target.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
    database,
  ]);
  if (!rowCount) await client.query(`CREATE DATABASE "${database.replaceAll('"', '""')}"`);
  await client.end();

  execSync('pnpm exec prisma migrate deploy', { stdio: 'inherit', env: process.env });
}
