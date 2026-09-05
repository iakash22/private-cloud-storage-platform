import pino, { type Logger, type LoggerOptions } from 'pino';

const REDACT_PATHS = [
  'password',
  'passwordHash',
  'secret',
  'token',
  'sessionToken',
  'csrfToken',
  'cookie',
  'accessKey',
  'secretKey',
  'keyHash',
  'tokenHash',
  'authorization',
  'JWT_SECRET',
  'MINIO_SECRET_KEY',
  'DATABASE_URL',
  'REDIS_URL',
  '*.password',
  '*.passwordHash',
  '*.secret',
  '*.token',
  '*.sessionToken',
  '*.csrfToken',
  '*.cookie',
  '*.accessKey',
  '*.secretKey',
  '*.keyHash',
  '*.tokenHash',
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
