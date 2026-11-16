import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { devvit } from '@devvit/start/vite';

/** Devvit build: client entry points from devvit.json plus the server bundle. */
export default defineConfig({
  plugins: [react(), devvit()],
});
