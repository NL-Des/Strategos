import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    // En local, le backend tourne sur le port 3000 (pnpm dev).
    proxy: { '/api': { target: 'http://localhost:3000', ws: true } },
  },
  test: {
    globals: true,
    include: ['src/**/*.spec.ts'],
  },
});
