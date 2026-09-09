import type { Request, Response } from 'express';
import { AppError } from '../../../lib/errors.js';
import { setRequestServiceAccount } from '../../../lib/request-context.js';
import { asyncHandler, type AsyncRouteHandler } from '../../../lib/async-handler.js';
import type { StorageModule } from '../../storage/storage.module.js';
import type { S3AuthStrategy } from '../s3-auth.strategy.js';
import { resolveS3Operation } from '../s3-operations.js';
import { renderS3Xml } from '../s3-xml.js';
import { S3GatewayHandlers } from '../s3-handlers.js';

export class S3GatewayController {
  private readonly handlers: S3GatewayHandlers;

  constructor(
    private readonly auth: S3AuthStrategy,
    storage: StorageModule,
  ) {
    this.handlers = new S3GatewayHandlers(storage);
  }

  handle: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const target = resolveS3Operation(req);

    if (!target) {
      this.sendError(
        req,
        res,
        501,
        'NotImplemented',
        'This S3 operation is not part of the supported subset',
      );
      return;
    }

    try {
      const principal = await this.auth.authenticate(req);
      setRequestServiceAccount(principal.principalId);
      await this.handlers.handle(principal, target, req, res);
    } catch (error: unknown) {
      const status = error instanceof AppError ? error.statusCode : 403;
      this.sendError(req, res, status, s3ErrorCode(error), s3ErrorMessage(error), target.bucket);
    }
  });

  private sendError(
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
}

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
    case 'FORBIDDEN':
      return 'AccessDenied';
    default:
      return 'AccessDenied';
  }
}

function s3ErrorMessage(error: unknown): string {
  return error instanceof AppError ? error.message : 'Internal error';
}
