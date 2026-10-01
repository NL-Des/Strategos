import { resolve } from 'node:path';
import { loadEncryptionKey } from './sources/connectors/token-crypto.js';

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
   * Google Sheets : les identifiants du projet Google Cloud sont saisis par l'admin
   * dans l'écran Sources et gardés en base (08), sauf si l'installateur les fournit
   * ici : ils ont alors priorité et ne se modifient plus depuis l'écran.
   */
  get google() {
    return {
      clientId: process.env.GOOGLE_CLIENT_ID || null,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || null,
      /** Clé d'API du sélecteur de fichiers, envoyée au navigateur de l'admin. */
      apiKey: process.env.GOOGLE_API_KEY || null,
      /** Adresse de retour à déclarer dans le client OAuth (`…/api/v1/google/callback`). */
      redirectUri:
        process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5173/api/v1/google/callback',
    };
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
  /** Clé de chiffrement créée par le backend : volume `keys` en conteneur, hors sauvegardes. */
  get keysDir(): string {
    return resolve(process.env.KEYS_DIR ?? '.data/keys');
  },
  /**
   * Clé de chiffrement des secrets gardés en base (jetons Google et OneDrive, secret
   * du client Google) : `TOKEN_ENCRYPTION_KEY` (32 octets en base64) si elle est
   * fournie, sinon une clé créée au premier besoin dans `keysDir`.
   */
  get tokenEncryptionKey(): Buffer {
    return loadEncryptionKey(process.env.TOKEN_ENCRYPTION_KEY, this.keysDir);
  },
  /** Adresses des API externes, surchargées par les tests (faux serveur). */
  get apis() {
    return {
      googleAuth: process.env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth',
      googleToken: process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token',
      googleUserinfo:
        process.env.GOOGLE_USERINFO_URL || 'https://openidconnect.googleapis.com/v1/userinfo',
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
