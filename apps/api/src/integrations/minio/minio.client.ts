import { S3Client } from '@aws-sdk/client-s3';
import type { S3ConnectionConfig } from './minio.config.js';

/**
 * Builds the AWS SDK v3 client used by the S3-compatible provider.
 *
 * Nothing here is MinIO-specific. MinIO is simply one endpoint this client can
 * point at; keeping construction isolated in this module is what stops
 * MinIO-shaped assumptions from leaking into business logic.
 */
export function createS3Client(connection: S3ConnectionConfig): S3Client {
  return new S3Client({
    region: connection.region,
    endpoint: connection.endpoint,
    // Required for MinIO and most self-hosted gateways, which do not support
    // virtual-host style addressing.
    forcePathStyle: connection.forcePathStyle,
    credentials: {
      accessKeyId: connection.accessKeyId,
      secretAccessKey: connection.secretAccessKey,
    },
  });
}
