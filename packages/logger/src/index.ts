import pino, { type Logger, type LoggerOptions } from 'pino';

const REDACT_PATHS = [
  'password',
  'secret',
  'token',
  'accessKey',
  'secretKey',
  'MINIO_SECRET_KEY',
  'DATABASE_URL',
  'REDIS_URL',
  '*.password',
  '*.secret',
  '*.token',
  '*.accessKey',
  '*.secretKey',
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
