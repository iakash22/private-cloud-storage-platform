import pino, { type Logger, type LoggerOptions } from 'pino';

const REDACT_PATHS = [
  'password',
  'passwordHash',
  'secret',
  'token',
  'accessKey',
  'secretKey',
  'keyHash',
  'authorization',
  'JWT_SECRET',
  'MINIO_SECRET_KEY',
  'DATABASE_URL',
  'REDIS_URL',
  '*.password',
  '*.passwordHash',
  '*.secret',
  '*.token',
  '*.accessKey',
  '*.secretKey',
  '*.keyHash',
  '*.authorization',
];

export interface CreateLoggerOptions {
  name: string;
  level?: LoggerOptions['level'];
}

export function createLogger(options: CreateLoggerOptions): Logger {
  return pino({
    name: options.name,
    level: options.level ?? 'info',
    redact: {
      paths: REDACT_PATHS,
      censor: '[REDACTED]',
    },
  });
}

export type { Logger };
