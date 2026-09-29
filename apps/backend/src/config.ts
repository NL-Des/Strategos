import { resolve } from 'node:path';

/** Réglages lus dans l'environnement (voir .env.example et docker-compose.yml). */
export const config = {
  /** Fichiers uploadés (images, Excel) : volume `uploads` en conteneur. */
  get uploadsDir(): string {
    return resolve(process.env.UPLOADS_DIR ?? '.data/uploads');
  },
  /** Archives de sauvegarde : volume `backups` en conteneur (11 — Sauvegardes). */
  get backupsDir(): string {
    return resolve(process.env.BACKUPS_DIR ?? '.data/backups');
  },
  /** Base de l'instance, pour `pg_dump` et `pg_restore`. */
  get databaseUrl(): string {
    return process.env.DATABASE_URL ?? '';
  },
  /** Outils PostgreSQL (paquet `postgresql18-client` de l'image), surchargés par les tests. */
  get pgDumpBin(): string {
    return process.env.PG_DUMP_BIN || 'pg_dump';
  },
  get pgRestoreBin(): string {
    return process.env.PG_RESTORE_BIN || 'pg_restore';
  },
  get isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  },
  /** Origines autorisées pour les requêtes qui modifient des données (en-tête `Origin`). */
  get appOrigins(): string[] {
    return (process.env.APP_ORIGINS ?? 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  },
  /**
   * Clé JSON du compte de service Google : fichier secret monté dans le conteneur,
   * jamais en base ni dans l'image (08, architecture §7). Absent = Google Sheets indisponible.
   */
  get googleServiceAccountFile(): string | null {
    return process.env.GOOGLE_SERVICE_ACCOUNT_FILE || null;
  },
  /** Application Azure (OneDrive, accès délégué) ; sans identifiant, OneDrive est indisponible. */
  get azure() {
    return {
      clientId: process.env.AZURE_CLIENT_ID || null,
      clientSecret: process.env.AZURE_CLIENT_SECRET || null,
      tenant: process.env.AZURE_TENANT || 'common',
      /** Adresse de retour déclarée dans l'application Azure (`…/api/v1/onedrive/callback`). */
      redirectUri:
        process.env.AZURE_REDIRECT_URI || 'http://localhost:5173/api/v1/onedrive/callback',
    };
  },
  /** Clé de chiffrement du jeton OneDrive : 32 octets en base64. */
  get tokenEncryptionKey(): Buffer | null {
    const key = process.env.TOKEN_ENCRYPTION_KEY;
    return key ? Buffer.from(key, 'base64') : null;
  },
  /** Adresses des API externes, surchargées par les tests (faux serveur). */
  get apis() {
    return {
      googleToken: process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token',
      sheets: process.env.GOOGLE_SHEETS_API || 'https://sheets.googleapis.com/v4',
      microsoftLogin: process.env.MICROSOFT_LOGIN_URL || 'https://login.microsoftonline.com',
      graph: process.env.GRAPH_API || 'https://graph.microsoft.com/v1.0',
    };
  },
  /** Durée du cache mémoire des sources connectées (08 : 30 à 60 secondes). */
  get sourceCacheMs(): number {
    return Number(process.env.SOURCE_CACHE_MS || 45_000);
  },
};
