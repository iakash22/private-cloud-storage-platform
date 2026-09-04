import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().min(1).startsWith('postgresql://'),
  REDIS_URL: z.string().min(1).startsWith('redis://'),
  MINIO_ENDPOINT: z.string().min(1),
  MINIO_PORT: z.coerce.number().int().positive().default(9000),
  MINIO_USE_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  MINIO_ACCESS_KEY: z.string().min(1),
  MINIO_SECRET_KEY: z.string().min(1),
  MINIO_BUCKET: z.string().min(1),
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

export function loadEnv(options: { path?: string } = {}): EnvConfig {
  const envPath = options.path ?? findEnvFile();
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

export { envSchema };
