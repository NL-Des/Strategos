import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['test/global-setup.ts'],
    // Une seule base de test partagée : les fichiers e2e s'exécutent l'un après l'autre.
    fileParallelism: false,
  },
});
