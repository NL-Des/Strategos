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
  /**
   * Nombre de proxys devant le backend : 1 (Caddy) par défaut, 2 si un autre proxy
   * précède Caddy. Trop bas, tous les utilisateurs semblent venir de la même adresse
   * et partagent les blocages ; trop haut, un client peut se donner l'adresse qu'il veut.
   */
  get trustProxy(): number {
    return Number(process.env.TRUST_PROXY || 1);
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
      /** Téléchargement d'un Google Sheet partagé par lien public. */
      googleExport: process.env.GOOGLE_EXPORT_URL || 'https://docs.google.com',
      /** Applications web Apps Script (Google Sheets reliés par un script). */
      googleScript: process.env.GOOGLE_SCRIPT_URL || 'https://script.google.com',
      microsoftLogin: process.env.MICROSOFT_LOGIN_URL || 'https://login.microsoftonline.com',
      graph: process.env.GRAPH_API || 'https://graph.microsoft.com/v1.0',
    };
  },
  /** Requêtes HTTP par minute et par session (par adresse sans session). */
  get rateLimitPerMinute(): number {
    return Number(process.env.RATE_LIMIT_PER_MINUTE || 300);
  },
  /** Images envoyées mais pas encore jointes à un message : total permis par compte. */
  get attachmentPendingQuotaBytes(): number {
    return Number(process.env.ATTACHMENT_PENDING_QUOTA_MB || 50) * 1024 * 1024;
  },
  /** Taille décompressée maximale d'un classeur `.xlsx`, vérifiée avant de le lire. */
  get xlsxMaxUncompressedBytes(): number {
    return Number(process.env.XLSX_MAX_UNCOMPRESSED_MB || 200) * 1024 * 1024;
  },
  /**
   * Plafonds de la passerelle WebSocket du chat (13 §4). La trame maximale laisse
   * passer un message de `MESSAGE_MAX_LENGTH` caractères, même tout en caractères
   * échappés ; au-delà, la connexion est fermée sans rien allouer.
   */
  get ws() {
    return {
      maxPayloadBytes: Number(process.env.WS_MAX_PAYLOAD_KB || 256) * 1024,
      maxConnectionsPerUser: Number(process.env.WS_MAX_CONNECTIONS_PER_USER || 10),
      /** Trames acceptées par connexion sur 10 secondes glissantes. */
      maxFramesPer10s: Number(process.env.WS_MESSAGES_PER_10S || 20),
    };
  },
  /** Durée du cache mémoire des sources connectées (08 : 30 à 60 secondes). */
  get sourceCacheMs(): number {
    return Number(process.env.SOURCE_CACHE_MS || 45_000);
  },
};
