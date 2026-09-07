import { PERMISSIONS } from '@vaultstack/types';
import {
  completeMultipartBodySchema,
  completeUploadBodySchema,
  createBucketBodySchema,
  initiateMultipartBodySchema,
  initiateUploadBodySchema,
  listObjectsQuerySchema,
  objectDestinationBodySchema,
  uploadPartQuerySchema,
} from '@vaultstack/validation';
import type { Request, Response } from 'express';
import { requestMeta } from '../../../lib/audit.js';
import { asyncHandler, type AsyncRouteHandler } from '../../../lib/async-handler.js';
import { routeParam } from '../../../lib/route-param.js';
import { StorageScopedController } from '../../../http/storage-scoped.controller.js';
import { readBody } from '../../../middleware/validate.js';

export class StorageController extends StorageScopedController {
  listBuckets: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const buckets = await this.container.storage.buckets.list(this.organizationId(req));
    this.ok(res, { buckets });
  });

  createBucket: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    const body = readBody(req, createBucketBodySchema);
    const bucket = await this.container.storage.buckets.create(
      this.organizationId(req),
      auth.user.id,
      { name: body.name, region: body.region ?? null, versioning: body.versioning },
      requestMeta(req),
    );
    this.created(res, { bucket });
  });

  getBucket: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const bucket = await this.container.storage.buckets.get(
      this.organizationId(req),
      routeParam(req, 'bucketId'),
    );
    this.ok(res, { bucket });
  });

  removeBucket: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    await this.container.storage.buckets.remove(
      this.organizationId(req),
      routeParam(req, 'bucketId'),
      auth.user.id,
      requestMeta(req),
    );
    this.noContent(res);
  });

  listObjects: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const query = listObjectsQuerySchema.parse(req.query);
    const page = await this.container.storage.objects.list(
      this.organizationId(req),
      routeParam(req, 'bucketId'),
      {
        prefix: query.prefix,
        delimiter: query.delimiter,
        limit: query.limit ?? 100,
        cursor: query.cursor,
      },
    );
    this.ok(res, page);
  });

  getObject: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const object = await this.container.storage.objects.get(
      this.organizationId(req),
      routeParam(req, 'objectId'),
    );
    this.ok(res, { object });
  });

  createDownloadUrl: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const url = await this.container.storage.objects.createDownloadUrl(
      this.organizationId(req),
      routeParam(req, 'objectId'),
      this.container.storage.baseUrl(req),
    );
    this.ok(res, { download: url });
  });

  removeObject: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    await this.container.storage.objects.remove(
      this.organizationId(req),
      routeParam(req, 'objectId'),
      auth.user.id,
      requestMeta(req),
    );
    this.noContent(res);
  });

  copyObject: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    const body = readBody(req, objectDestinationBodySchema);
    const object = await this.container.storage.objects.copy({
      organizationId: this.organizationId(req),
      objectId: routeParam(req, 'objectId'),
      destinationBucketId: body.destinationBucketId,
      destinationKey: body.destinationKey,
      userId: auth.user.id,
      meta: requestMeta(req),
    });
    this.created(res, { object });
  });

  moveObject: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    const body = readBody(req, objectDestinationBodySchema);
    const object = await this.container.storage.objects.move({
      organizationId: this.organizationId(req),
      objectId: routeParam(req, 'objectId'),
      destinationBucketId: body.destinationBucketId,
      destinationKey: body.destinationKey,
      userId: auth.user.id,
      meta: requestMeta(req),
    });
    this.ok(res, { object });
  });

  initiateUpload: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    const body = readBody(req, initiateUploadBodySchema);
    const result = await this.container.storage.uploads.initiate({
      organizationId: this.organizationId(req),
      bucketId: body.bucketId,
      key: body.key,
      contentType: body.contentType,
      size: body.size,
      userId: auth.user.id,
      baseUrl: this.container.storage.baseUrl(req),
      meta: requestMeta(req),
    });
    this.created(res, result);
  });

  completeUpload: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    const body = readBody(req, completeUploadBodySchema);
    const object = await this.container.storage.uploads.complete({
      organizationId: this.organizationId(req),
      uploadId: routeParam(req, 'uploadId'),
      userId: auth.user.id,
      checksumSha256: body.checksumSha256,
      meta: requestMeta(req),
    });
    this.created(res, { object });
  });

  abortUpload: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    await this.container.storage.uploads.abort({
      organizationId: this.organizationId(req),
      uploadId: routeParam(req, 'uploadId'),
      userId: auth.user.id,
      meta: requestMeta(req),
    });
    this.noContent(res);
  });

  initiateMultipart: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    const body = readBody(req, initiateMultipartBodySchema);
    const result = await this.container.storage.uploads.initiateMultipart({
      organizationId: this.organizationId(req),
      bucketId: body.bucketId,
      key: body.key,
      contentType: body.contentType,
      userId: auth.user.id,
      meta: requestMeta(req),
    });
    this.created(res, result);
  });

  uploadPart: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { partNumber } = uploadPartQuerySchema.parse(req.query);
    const controller = new AbortController();
    const onClose = (): void => {
      if (!res.writableEnded) {
        controller.abort();
      }
    };
    req.on('aborted', onClose);
    req.on('close', onClose);

    try {
      const part = await this.container.storage.uploads.uploadPart({
        organizationId: this.organizationId(req),
        uploadId: routeParam(req, 'uploadId'),
        partNumber,
        body: req,
        signal: controller.signal,
      });
      this.ok(res, { part });
    } finally {
      req.off('aborted', onClose);
      req.off('close', onClose);
    }
  });

  completeMultipart: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    const body = readBody(req, completeMultipartBodySchema);
    const object = await this.container.storage.uploads.completeMultipart({
      organizationId: this.organizationId(req),
      uploadId: routeParam(req, 'uploadId'),
      userId: auth.user.id,
      parts: body.parts,
      meta: requestMeta(req),
    });
    this.created(res, { object });
  });

  abortMultipart: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    await this.container.storage.uploads.abortMultipart({
      organizationId: this.organizationId(req),
      uploadId: routeParam(req, 'uploadId'),
      userId: auth.user.id,
      meta: requestMeta(req),
    });
    this.noContent(res);
  });

  static readonly readPermission = PERMISSIONS.STORAGE_READ;
  static readonly uploadPermission = PERMISSIONS.STORAGE_UPLOAD;
  static readonly deletePermission = PERMISSIONS.STORAGE_DELETE;
}
