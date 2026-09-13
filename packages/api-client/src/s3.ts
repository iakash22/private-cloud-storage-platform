import type { S3Client } from '@aws-sdk/client-s3';

export interface VaultStackS3ClientOptions {
  endpoint: string;
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * Creates an AWS SDK client for VaultStack's optional S3 gateway.
 * The gateway must be enabled separately on the API.
 */
export async function createVaultStackS3Client(
  options: VaultStackS3ClientOptions,
): Promise<S3Client> {
  const { S3Client } = await import('@aws-sdk/client-s3');
  return new S3Client({
    endpoint: options.endpoint.replace(/\/$/, ''),
    region: options.region ?? 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
    },
  });
}
