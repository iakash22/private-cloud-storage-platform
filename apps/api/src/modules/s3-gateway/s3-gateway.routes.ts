import { Router, type Request, type Response } from 'express';
import { AppError } from '../../lib/errors.js';
import { createUnconfiguredS3AuthStrategy, type S3AuthStrategy } from './s3-auth.strategy.js';
import { resolveS3Operation } from './s3-operations.js';
import { renderS3Xml } from './s3-xml.js';

/**
 * S3-compatible gateway.
 *
 * Phase 3 delivers the protocol foundation: operation resolution, the XML
 * error/response envelope, and a pluggable authentication seam. Operation
 * handlers are intentionally not wired to the storage services yet because
 * S3 clients sign requests with SigV4, which requires a credential store that
 * can return a secret key — that arrives with service accounts.
 *
 * Requests are answered with well-formed S3 errors, so a real S3 client gets a
 * parseable response instead of a VaultStack JSON body.
 */
export function createS3GatewayRouter(options?: { auth?: S3AuthStrategy }): Router {
  const router = Router();
  const auth = options?.auth ?? createUnconfiguredS3AuthStrategy();

  router.all(/.*/, (req: Request, res: Response) => {
    const target = resolveS3Operation(req);

    if (!target) {
      sendS3Error(
        req,
        res,
        501,
        'NotImplemented',
        'This S3 operation is not part of the supported subset',
      );
      return;
    }

    // Authentication runs before any storage lookup, so an unauthenticated
    // caller cannot probe which buckets or keys exist.
    auth
      .authenticate(req)
      .then(() => {
        sendS3Error(
          req,
          res,
          501,
          'NotImplemented',
          `${target.operation} is recognized but not yet served by the gateway`,
        );
      })
      .catch((error: unknown) => {
        const status = error instanceof AppError ? error.statusCode : 403;
        sendS3Error(req, res, status, s3ErrorCode(error), s3ErrorMessage(error), target.bucket);
      });
  });

  return router;
}

function sendS3Error(
  req: Request,
  res: Response,
  status: number,
  code: string,
  message: string,
  bucket?: string,
): void {
  res
    .status(status)
    .type('application/xml')
    .send(
      renderS3Xml('Error', {
        Code: code,
        Message: message,
        BucketName: bucket ?? null,
        Resource: req.originalUrl,
        RequestId: req.requestId,
      }),
    );
}

/** Translates VaultStack error codes into their S3 protocol equivalents. */
function s3ErrorCode(error: unknown): string {
  if (!(error instanceof AppError)) {
    return 'InternalError';
  }

  switch (error.code) {
    case 'STORAGE_BUCKET_NOT_FOUND':
      return 'NoSuchBucket';
    case 'STORAGE_OBJECT_NOT_FOUND':
      return 'NoSuchKey';
    case 'STORAGE_MULTIPART_NOT_FOUND':
      return 'NoSuchUpload';
    case 'STORAGE_BUCKET_NOT_EMPTY':
      return 'BucketNotEmpty';
    case 'STORAGE_INVALID_BUCKET_NAME':
      return 'InvalidBucketName';
    case 'STORAGE_INVALID_KEY':
      return 'InvalidArgument';
    case 'STORAGE_CHECKSUM_MISMATCH':
      return 'BadDigest';
    case 'STORAGE_OBJECT_TOO_LARGE':
      return 'EntityTooLarge';
    case 'STORAGE_MULTIPART_INVALID_PART':
      return 'InvalidPart';
    case 'STORAGE_NOT_IMPLEMENTED':
      return 'NotImplemented';
    case 'UNAUTHORIZED':
      return 'InvalidAccessKeyId';
    default:
      return 'AccessDenied';
  }
}

function s3ErrorMessage(error: unknown): string {
  // Never surface an unexpected internal message over the S3 protocol.
  return error instanceof AppError ? error.message : 'Internal error';
}
