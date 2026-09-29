import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    // En local, le backend tourne sur le port 3000 (pnpm dev) ; les tests navigateur
    // (e2e/) lancent le leur ailleurs.
    proxy: { '/api': { target: process.env.API_TARGET ?? 'http://localhost:3000', ws: true } },
  },
  test: {
    globals: true,
    include: ['src/**/*.spec.ts'],
  },
});
