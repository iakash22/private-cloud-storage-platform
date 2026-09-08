import type { S3Client } from '@aws-sdk/client-s3';
import type { S3ConnectionConfig } from '../../../../integrations/minio/minio.config.js';
import { createS3Client } from '../../../../integrations/minio/minio.client.js';
import type { StorageProvider } from '../../domain/storage-provider.js';
import type { S3DialectAdapter } from './dialects.js';
import { createS3CompatibleProvider } from './s3-compatible.provider.js';

export function connectionFromParts(input: {
  endpoint?: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}): S3ConnectionConfig {
  return {
    endpoint: input.endpoint,
    region: input.region,
    accessKeyId: input.accessKeyId,
    secretAccessKey: input.secretAccessKey,
    forcePathStyle: input.forcePathStyle,
  };
}

export function createS3CompatibleProviderFromConnection(input: {
  connection: S3ConnectionConfig;
  dialect?: Pick<S3DialectAdapter, 'sendCreateBucketLocationConstraint'>;
  ownsPhysicalBuckets?: boolean;
  client?: S3Client;
}): StorageProvider {
  return createS3CompatibleProvider({
    client: input.client ?? createS3Client(input.connection),
    region: input.connection.region,
    sendCreateBucketLocationConstraint: input.dialect?.sendCreateBucketLocationConstraint,
    ownsPhysicalBuckets: input.ownsPhysicalBuckets,
  });
}
