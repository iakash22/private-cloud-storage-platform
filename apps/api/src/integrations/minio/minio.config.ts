import type { EnvConfig } from '@vaultstack/config';

/**
 * Resolves generic S3-compatible connection settings.
 *
 * This is deliberately provider-neutral: the same shape drives AWS S3,
 * Cloudflare R2, Backblaze B2, MinIO, DigitalOcean Spaces and Wasabi. The
 * legacy MINIO_* variables are honoured only as a development fallback so that
 * existing local .env files keep working.
 */
export interface S3ConnectionConfig {
  endpoint?: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

export function resolveS3Connection(config: EnvConfig): S3ConnectionConfig | null {
  const accessKeyId = config.S3_ACCESS_KEY ?? config.MINIO_ACCESS_KEY;
  const secretAccessKey = config.S3_SECRET_KEY ?? config.MINIO_SECRET_KEY;

  if (!accessKeyId || !secretAccessKey) {
    return null;
  }

  return {
    endpoint: config.S3_ENDPOINT ?? minioEndpointUrl(config),
    region: config.S3_REGION,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: config.S3_FORCE_PATH_STYLE,
  };
}

/** Builds a URL from the development MINIO_* variables, when present. */
function minioEndpointUrl(config: EnvConfig): string | undefined {
  if (!config.MINIO_ENDPOINT) {
    return undefined;
  }

  const protocol = config.MINIO_USE_SSL ? 'https' : 'http';
  return `${protocol}://${config.MINIO_ENDPOINT}:${config.MINIO_PORT}`;
}

/**
 * Redacted description of a connection, safe for logs and health output.
 * Access keys and secret keys are never included.
 */
export function describeS3Connection(
  connection: S3ConnectionConfig,
): Record<string, string | boolean> {
  return {
    endpoint: connection.endpoint ?? 'aws-default',
    region: connection.region,
    forcePathStyle: connection.forcePathStyle,
    credentials: 'configured',
  };
}
