import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { findEnvFile, loadRootEnv } from './load-root-env.js';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('load-root-env', () => {
  it('finds .env in an ancestor directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'vaultstack-env-'));
    const nested = join(root, 'packages', 'database');
    writeFileSync(join(root, '.env'), 'DATABASE_URL=postgresql://example\n', 'utf8');

    expect(findEnvFile(nested)).toBe(join(root, '.env'));
  });

  it('loads variables from the monorepo root .env', () => {
    const root = mkdtempSync(join(tmpdir(), 'vaultstack-env-'));
    const nested = join(root, 'packages', 'database');
    writeFileSync(
      join(root, '.env'),
      'DATABASE_URL=postgresql://loaded\n# comment\nJWT_SECRET=abc\n',
      'utf8',
    );

    delete process.env.DATABASE_URL;
    delete process.env.JWT_SECRET;
    expect(loadRootEnv(nested)).toBe(join(root, '.env'));
    expect(process.env.DATABASE_URL).toBe('postgresql://loaded');
    expect(process.env.JWT_SECRET).toBe('abc');
  });
});
