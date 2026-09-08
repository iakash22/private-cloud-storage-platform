import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadEnv, loadEnvFile } from './index.js';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('@vaultstack/config', () => {
  it('loads valid environment variables without MinIO', () => {
    process.env = {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://vaultstack:vaultstack_dev@localhost:5432/vaultstack',
      REDIS_URL: 'redis://localhost:6379',
      JWT_SECRET: 'phase1-test-jwt-secret-value-32chars',
    };

    const config = loadEnv({ path: '.env.missing' });

    expect(config.NODE_ENV).toBe('test');
    expect(config.JWT_SECRET).toHaveLength(36);
    expect(config.MINIO_ENDPOINT).toBeUndefined();
    expect(config.DOCKER_SOCKET).toBe('/var/run/docker.sock');
  });

  it('throws on invalid environment variables', () => {
    process.env = {
      NODE_ENV: 'test',
    };

    expect(() => loadEnv({ path: '.env.missing' })).toThrow(/Invalid environment configuration/);
  });

  it('loadEnvFile walks up to a monorepo root .env', () => {
    const root = mkdtempSync(join(tmpdir(), 'vaultstack-config-env-'));
    const nested = join(root, 'apps', 'api');
    writeFileSync(join(root, '.env'), 'DATABASE_URL=postgresql://from-root\n', 'utf8');

    delete process.env.DATABASE_URL;
    expect(loadEnvFile({ startDir: nested })).toBe(join(root, '.env'));
    expect(process.env.DATABASE_URL).toBe('postgresql://from-root');
  });
});
