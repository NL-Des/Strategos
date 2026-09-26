import { resolve } from 'node:path';

/** Réglages lus dans l'environnement (voir .env.example et docker-compose.yml). */
export const config = {
  /** Fichiers uploadés (images, Excel) : volume `uploads` en conteneur. */
  get uploadsDir(): string {
    return resolve(process.env.UPLOADS_DIR ?? '.data/uploads');
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
};
