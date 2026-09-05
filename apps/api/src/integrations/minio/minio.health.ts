import { ListBucketsCommand, type S3Client } from '@aws-sdk/client-s3';
import type { DependencyCheck } from '@vaultstack/types';

/**
 * Liveness probe for an S3-compatible endpoint.
 *
 * Reported as a soft dependency: VaultStack's primary storage backend is the
 * local filesystem, so an unreachable S3 endpoint degrades the integration
 * rather than failing readiness.
 */
export async function checkS3Endpoint(client: S3Client): Promise<DependencyCheck> {
  try {
    await client.send(new ListBucketsCommand({}));
    return { name: 's3', status: 'ok' };
  } catch (error) {
    return {
      name: 's3',
      status: 'degraded',
      message: error instanceof Error ? error.message : 'S3 endpoint unreachable',
    };
  }
}
