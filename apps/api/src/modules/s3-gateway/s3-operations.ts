import type { Request } from 'express';

/** The S3 operations VaultStack's gateway recognizes in Phase 3. */
export const S3_OPERATIONS = [
  'ListBuckets',
  'CreateBucket',
  'HeadBucket',
  'DeleteBucket',
  'PutObject',
  'GetObject',
  'HeadObject',
  'DeleteObject',
  'CopyObject',
  'ListObjects',
  'ListObjectsV2',
  'CreateMultipartUpload',
  'UploadPart',
  'CompleteMultipartUpload',
  'AbortMultipartUpload',
] as const;

export type S3Operation = (typeof S3_OPERATIONS)[number];

export interface S3RequestTarget {
  operation: S3Operation;
  /** Absent for service-level operations such as ListBuckets. */
  bucket?: string;
  key?: string;
  uploadId?: string;
  partNumber?: number;
}

/**
 * Maps a raw S3 protocol request onto an operation.
 *
 * S3 encodes the operation in the combination of method, path depth, query
 * parameters and headers rather than in the path itself, so this resolution is
 * kept in one place. Returning `undefined` means "not part of the supported
 * subset", which the router reports as NotImplemented rather than guessing.
 */
export function resolveS3Operation(req: Request): S3RequestTarget | undefined {
  const segments = req.path.split('/').filter((segment) => segment.length > 0);
  const [bucket, ...keyParts] = segments;
  const key = keyParts.join('/');
  const uploadId = singleQueryValue(req, 'uploadId');
  const hasUploads = hasQueryFlag(req, 'uploads');
  const partNumber = singleQueryValue(req, 'partNumber');

  if (!bucket) {
    return req.method === 'GET' ? { operation: 'ListBuckets' } : undefined;
  }

  if (!key) {
    switch (req.method) {
      case 'GET':
        // list-type=2 selects ListObjectsV2; its absence means the V1 shape.
        return {
          operation: singleQueryValue(req, 'list-type') === '2' ? 'ListObjectsV2' : 'ListObjects',
          bucket,
        };
      case 'PUT':
        return { operation: 'CreateBucket', bucket };
      case 'HEAD':
        return { operation: 'HeadBucket', bucket };
      case 'DELETE':
        return { operation: 'DeleteBucket', bucket };
      default:
        return undefined;
    }
  }

  switch (req.method) {
    case 'GET':
      return { operation: 'GetObject', bucket, key };
    case 'HEAD':
      return { operation: 'HeadObject', bucket, key };
    case 'PUT':
      if (uploadId && partNumber) {
        return {
          operation: 'UploadPart',
          bucket,
          key,
          uploadId,
          partNumber: Number(partNumber),
        };
      }
      // A copy source header is what distinguishes CopyObject from PutObject.
      return req.header('x-amz-copy-source')
        ? { operation: 'CopyObject', bucket, key }
        : { operation: 'PutObject', bucket, key };
    case 'POST':
      if (hasUploads) {
        return { operation: 'CreateMultipartUpload', bucket, key };
      }
      return uploadId ? { operation: 'CompleteMultipartUpload', bucket, key, uploadId } : undefined;
    case 'DELETE':
      return uploadId
        ? { operation: 'AbortMultipartUpload', bucket, key, uploadId }
        : { operation: 'DeleteObject', bucket, key };
    default:
      return undefined;
  }
}

function singleQueryValue(req: Request, name: string): string | undefined {
  const value = req.query[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function hasQueryFlag(req: Request, name: string): boolean {
  return Object.hasOwn(req.query, name);
}
