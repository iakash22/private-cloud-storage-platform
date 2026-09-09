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

  it('loads production secrets from *_FILE variables', () => {
    const root = mkdtempSync(join(tmpdir(), 'vaultstack-config-secrets-'));
    const databaseUrlFile = join(root, 'database_url');
    const jwtSecretFile = join(root, 'jwt_secret');
    writeFileSync(
      databaseUrlFile,
      'postgresql://secret-user:secret-password@postgres:5432/vaultstack\n',
      'utf8',
    );
    writeFileSync(jwtSecretFile, 'production-jwt-secret-value-that-is-long-enough\n', 'utf8');

    process.env = {
      ...process.env,
      NODE_ENV: 'production',
      DATABASE_URL_FILE: databaseUrlFile,
      JWT_SECRET_FILE: jwtSecretFile,
      REDIS_URL: 'redis://redis:6379',
    };
    delete process.env.DATABASE_URL;
    delete process.env.JWT_SECRET;

    const config = loadEnv({ path: '.env.missing' });

    expect(config.DATABASE_URL).toBe(
      'postgresql://secret-user:secret-password@postgres:5432/vaultstack',
    );
    expect(config.JWT_SECRET).toBe('production-jwt-secret-value-that-is-long-enough');
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
