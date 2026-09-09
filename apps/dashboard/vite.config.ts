import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Load VITE_* from the monorepo root .env (shared with the API).
  envDir: path.resolve(__dirname, '../..'),
  // @vitest-environment jsdom
  plugins: [react()],
  resolve: {
    alias: {
      '@vaultstack/ui': path.resolve(__dirname, '../../packages/ui/src/index.ts'),
      '@vaultstack/api-client': path.resolve(__dirname, '../../packages/api-client/src/index.ts'),
      '@vaultstack/validation': path.resolve(__dirname, '../../packages/validation/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: 'dist',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
});
