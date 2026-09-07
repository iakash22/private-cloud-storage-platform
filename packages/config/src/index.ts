import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

const optionalMinio = z.string().min(1).optional();
const optionalS3 = z.string().min(1).optional();

const booleanFromString = z.enum(['true', 'false']).transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().min(1).startsWith('postgresql://'),
  REDIS_URL: z.string().min(1).startsWith('redis://'),
  JWT_SECRET: z.string().min(32),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(43_200),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  LOGIN_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),
  API_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  API_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  MINIO_ENDPOINT: optionalMinio,
  MINIO_PORT: z.coerce.number().int().positive().default(9000),
  MINIO_USE_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  MINIO_ACCESS_KEY: optionalMinio,
  MINIO_SECRET_KEY: optionalMinio,
  MINIO_BUCKET: optionalMinio,

  // Storage engine. The local filesystem is the primary production backend;
  // S3-compatible endpoints (including MinIO) are optional integrations.
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),

  // Root of the object store. Never hardcode a production path: development
  // uses a Docker volume mounted at /data, production mounts /srv/vaultstack/data.
  STORAGE_LOCAL_ROOT: z.string().min(1).default('/data'),

  // Centralized size limits so they are not scattered through the codebase.
  STORAGE_MAX_OBJECT_SIZE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(5 * 1024 * 1024 * 1024),
  STORAGE_MAX_REQUEST_SIZE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(64 * 1024 * 1024),
  STORAGE_MULTIPART_MIN_PART_SIZE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(5 * 1024 * 1024),
  STORAGE_MULTIPART_MAX_PARTS: z.coerce.number().int().positive().max(10_000).default(10_000),
  STORAGE_MAX_METADATA_BYTES: z.coerce.number().int().positive().default(2048),
  STORAGE_MAX_KEY_LENGTH: z.coerce.number().int().positive().max(1024).default(1024),
  STORAGE_PRESIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().max(604_800).default(900),
  STORAGE_UPLOAD_TTL_SECONDS: z.coerce.number().int().positive().default(3600),

  // Generic S3-compatible configuration. Works against AWS S3, Cloudflare R2,
  // Backblaze B2, MinIO, DigitalOcean Spaces, Wasabi and similar endpoints.
  S3_ENDPOINT: optionalS3,
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_ACCESS_KEY: optionalS3,
  S3_SECRET_KEY: optionalS3,
  S3_FORCE_PATH_STYLE: booleanFromString.default('true'),

  // Enables the S3-compatible gateway. Disabled by default because gateway
  // credential signing lands in a later phase.
  S3_GATEWAY_ENABLED: booleanFromString.default('false'),
  S3_GATEWAY_REGION: z.string().min(1).default('vaultstack'),
});

export type EnvConfig = z.infer<typeof envSchema>;

function findEnvFile(startDir: string = process.cwd()): string {
  let current = startDir;

  for (;;) {
    const candidate = join(current, '.env');
    if (existsSync(candidate)) {
      return candidate;
    }

    const parent = dirname(current);
    if (parent === current) {
      return join(startDir, '.env');
    }

    current = parent;
  }
}

/** Load `.env` into `process.env` without validation (for tools that only need raw vars). */
export function loadEnvFile(options: { startDir?: string; path?: string } = {}): string {
  const envPath = options.path ?? findEnvFile(options.startDir ?? process.cwd());
  loadDotenv({ path: envPath });
  return envPath;
}

export function loadEnv(options: { path?: string; startDir?: string } = {}): EnvConfig {
  const envPath = options.path ?? findEnvFile(options.startDir ?? process.cwd());
  loadDotenv({ path: envPath });

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.flatten().fieldErrors;
    const message = Object.entries(formatted)
      .map(([key, errors]) => `${key}: ${errors.join(', ')}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${message}`);
  }

  return result.data;
}

export { envSchema, findEnvFile };
