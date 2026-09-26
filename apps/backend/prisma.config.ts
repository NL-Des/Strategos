import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Prisma ne charge plus .env de lui-même : on le lit en local s'il existe.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // `prisma generate` n'a pas besoin de base : une URL factice suffit hors migrations.
    url: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/unset',
  },
});
