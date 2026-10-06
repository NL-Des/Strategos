import { type ChildProcess, execSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import pg from 'pg';
import { FakeApis, type FakeSheets } from '../apps/backend/test/fake-apis.ts';
import { PORTS, SHEET_ID, STOCK_ITEM } from './stack.ts';

const ROOT = resolve(import.meta.dirname, '..');
const BACKEND = join(ROOT, 'apps/backend');

/** Feuilles de la guilde (parcours B et D). */
function guildSheets(): FakeSheets {
  return {
    Inscriptions: {
      A1: 'Pseudo',
      B1: 'Classe',
      C1: 'Niveau',
      D1: 'Équipe',
      F1: { f: '=64-COUNTA(A2:A65)', v: 63 },
      A2: 'Arkan',
      B2: 'Guerrier',
      C2: 12,
      D2: 'Rouge',
      H1: 'Classes',
      H2: 'Guerrier',
      H3: 'Mage',
      H4: 'Voleur',
    },
    Arkan: {
      A1: 'Objet',
      B1: 'Quantité',
      A2: 'Potion',
      B2: 3,
      A3: 'Épée runique',
      B3: 1,
      D1: 'Or',
      E1: 250,
    },
  };
}

/** `stock.xlsx` sur le OneDrive de Marc (parcours C) : 200 produits. */
function stockSheets(): FakeSheets {
  const stock: FakeSheets[string] = {
    A1: 'Référence',
    B1: 'Produit',
    C1: 'Quantité',
    D1: 'Image',
  };
  for (let n = 1; n <= 200; n++) {
    stock[`A${n + 1}`] = n;
    stock[`B${n + 1}`] = `Produit ${n}`;
    stock[`C${n + 1}`] = n === 137 ? 8 : 20;
    stock[`D${n + 1}`] = 'carton.png';
  }
  return { Stock: stock };
}

async function waitFor(url: string, timeoutMs = 60_000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Pas encore prêt.
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Pas de réponse de ${url}`);
}

/**
 * Instance neuve pour les parcours : base recréée et migrée, faux serveur
 * Google/Microsoft, backend compilé (`pnpm test:browser` le construit) et
 * frontend Vite. Renvoie l'arrêt de l'ensemble.
 */
export default async function setup(): Promise<() => Promise<void>> {
  // Captures du test responsive : celles de l'exécution précédente sont effacées.
  rmSync(join(import.meta.dirname, 'screenshots'), { recursive: true, force: true });
  const databaseUrl =
    process.env.BROWSER_DATABASE_URL ??
    'postgresql://strategos:strategos@localhost:5432/strategos_browser';
  const target = new URL(databaseUrl);
  const database = target.pathname.slice(1);
  const admin = new URL(databaseUrl);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  await client.query(`CREATE DATABASE "${database}"`);
  await client.end();
  execSync('pnpm exec prisma migrate deploy', {
    cwd: BACKEND,
    stdio: 'ignore',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });

  const fake = new FakeApis();
  const fakeUrl = await fake.start(PORTS.fakeApis);
  fake.spreadsheets.set(SHEET_ID, { title: 'Guilde', picked: true, sheets: guildSheets() });
  fake.workbooks.set(STOCK_ITEM, { name: 'stock.xlsx', sheets: stockSheets() });

  const work = mkdtempSync(join(tmpdir(), 'strategos-browser-'));
  const frontendUrl = `http://localhost:${PORTS.frontend}`;

  const processes: ChildProcess[] = [];
  // Hors du dossier du backend : son `.env` de développement n'est pas lu.
  const backend = spawn('node', [join(BACKEND, 'dist/src/main.js')], {
    cwd: work,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(PORTS.backend),
      DATABASE_URL: databaseUrl,
      APP_ORIGINS: frontendUrl,
      UPLOADS_DIR: join(work, 'uploads'),
      BACKUPS_DIR: join(work, 'backups'),
      KEYS_DIR: join(work, 'keys'),
      GOOGLE_AUTH_URL: `${fakeUrl}/google/authorize`,
      GOOGLE_TOKEN_URL: `${fakeUrl}/google/token`,
      GOOGLE_USERINFO_URL: `${fakeUrl}/google/userinfo`,
      GOOGLE_REDIRECT_URI: `${frontendUrl}/api/v1/google/callback`,
      GOOGLE_SHEETS_API: `${fakeUrl}/sheets`,
      GOOGLE_EXPORT_URL: `${fakeUrl}/export`,
      GOOGLE_SCRIPT_URL: `${fakeUrl}/script`,
      MICROSOFT_LOGIN_URL: `${fakeUrl}/ms`,
      GRAPH_API: `${fakeUrl}/graph`,
      AZURE_CLIENT_ID: 'client-test',
      AZURE_CLIENT_SECRET: 'secret-test',
      AZURE_REDIRECT_URI: `${frontendUrl}/api/v1/onedrive/callback`,
      SOURCE_CACHE_MS: '0',
    },
  });
  processes.push(backend);
  const frontend = spawn(
    'pnpm',
    [
      '--filter',
      '@strategos/frontend',
      'exec',
      'vite',
      '--port',
      String(PORTS.frontend),
      '--strictPort',
    ],
    {
      cwd: ROOT,
      stdio: ['ignore', 'ignore', 'inherit'],
      env: { ...process.env, API_TARGET: `http://localhost:${PORTS.backend}` },
      detached: true,
    },
  );
  processes.push(frontend);

  const stop = async () => {
    backend.kill();
    // Vite passe par pnpm : tout le groupe de processus est arrêté.
    if (frontend.pid) process.kill(-frontend.pid);
    await fake.stop();
  };
  try {
    await waitFor(`${frontendUrl}/api/v1/health`);
  } catch (error) {
    await stop();
    throw error;
  }
  return stop;
}
