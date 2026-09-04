import { afterEach, describe, expect, it } from 'vitest';
import { loadEnv } from './index.js';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('@vaultstack/config', () => {
  it('loads valid environment variables', () => {
    process.env = {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://vaultstack:vaultstack_dev@localhost:5432/vaultstack',
      REDIS_URL: 'redis://localhost:6379',
      MINIO_ENDPOINT: 'localhost',
      MINIO_PORT: '9000',
      MINIO_USE_SSL: 'false',
      MINIO_ACCESS_KEY: 'test-key',
      MINIO_SECRET_KEY: 'test-secret',
      MINIO_BUCKET: 'vaultstack',
    };

    const config = loadEnv({ path: '.env.missing' });

    expect(config.NODE_ENV).toBe('test');
    expect(config.MINIO_USE_SSL).toBe(false);
  });

  it('throws on invalid environment variables', () => {
    process.env = {
      NODE_ENV: 'test',
    };

    expect(() => loadEnv({ path: '.env.missing' })).toThrow(/Invalid environment configuration/);
  });
});
