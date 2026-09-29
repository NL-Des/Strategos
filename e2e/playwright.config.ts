import { defineConfig, devices } from '@playwright/test';
import { BASE_URL } from './stack.ts';

/**
 * Parcours A à D de la conception (12 — Parcours) sur une instance neuve, puis
 * vérification des écrans sur mobile et tablette. Les fichiers s'enchaînent dans
 * l'ordre, sur la même instance : chaque parcours reprend là où le précédent s'arrête.
 */
export default defineConfig({
  testDir: 'tests',
  globalSetup: './global-setup.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  outputDir: 'results',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: BASE_URL,
    locale: 'fr-FR',
    trace: 'retain-on-failure',
  },
});
