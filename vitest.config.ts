import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'tests/e2e/**',
      '**/*.integration.test.ts',
      '**/src/integration/**',
    ],
    environmentMatchGlobs: [
      ['packages/ui/**', 'jsdom'],
      ['apps/dashboard/**', 'jsdom'],
    ],
    setupFiles: [path.join(rootDir, 'packages/ui/vitest.setup.ts')],
  },
});
