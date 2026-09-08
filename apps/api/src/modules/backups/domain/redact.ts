import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const SECRET_KEY_PATTERN = /(secret|password|token|credential|private[_-]?key)/i;
const SECRET_KEYS = new Set([
  'JWT_SECRET',
  'MINIO_SECRET_KEY',
  'MINIO_ACCESS_KEY',
  'S3_SECRET_KEY',
  'S3_ACCESS_KEY',
  'DATABASE_URL',
  'REDIS_URL',
  'MONGODB_URI',
]);

export function redactConfigValue(key: string, value: unknown): unknown {
  if (SECRET_KEYS.has(key) || SECRET_KEY_PATTERN.test(key)) {
    return '[REDACTED]';
  }
  if (typeof value === 'string' && value.startsWith('postgresql://')) {
    return '[REDACTED]';
  }
  return value;
}

export function redactConfigRecord(input: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    redacted[key] = redactConfigValue(key, value);
  }
  return redacted;
}

export async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function writeTextFile(path: string, value: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value, 'utf8');
}

export function componentPath(workDir: string, relativePath: string): string {
  return join(workDir, 'components', relativePath);
}
