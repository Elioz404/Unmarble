import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The lab: the client served on its own, with the browser-only platform.
 * `npm run lab` for local design work; `npm run lab:build` for a static
 * bundle to host for stranger playtests.
 */
export default defineConfig({
  root: resolve(import.meta.dirname, 'src/client'),
  plugins: [react()],
  server: { port: 5199, strictPort: true },
  build: {
    outDir: resolve(import.meta.dirname, 'dist/lab'),
    emptyOutDir: true,
    rollupOptions: { input: { lab: resolve(import.meta.dirname, 'src/client/lab.html') } },
  },
});
