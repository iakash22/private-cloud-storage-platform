import { defineConfig, devices } from '@playwright/test';

const dashboardPort = 5173;
const apiPort = 3000;

const devEnv = {
  NODE_ENV: 'development',
  API_HOST: '127.0.0.1',
  API_PORT: String(apiPort),
  LOG_LEVEL: 'info',
  DATABASE_URL: 'postgresql://vaultstack:vaultstack_dev@localhost:5432/vaultstack',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'phase1-test-jwt-secret-value-32chars',
  STORAGE_DRIVER: 'local',
  STORAGE_LOCAL_ROOT: '/tmp/vaultstack-playwright-storage',
  MINIO_ENDPOINT: 'localhost',
  MINIO_PORT: '9000',
  MINIO_USE_SSL: 'false',
  MINIO_ACCESS_KEY: 'vaultstack_minio',
  MINIO_SECRET_KEY: 'vaultstack_minio_secret_change_me',
  MINIO_BUCKET: 'vaultstack',
  VITE_API_URL: `http://127.0.0.1:${apiPort}`,
};

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list']],
  use: {
    trace: 'on-first-retry',
    baseURL: `http://127.0.0.1:${dashboardPort}`,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @vaultstack/api dev',
      url: `http://127.0.0.1:${apiPort}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: devEnv,
    },
    {
      command: 'pnpm --filter @vaultstack/dashboard dev',
      url: `http://127.0.0.1:${dashboardPort}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: devEnv,
    },
  ],
});
