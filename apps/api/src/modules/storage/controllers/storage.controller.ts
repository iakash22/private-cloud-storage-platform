import { PERMISSIONS } from '@vaultstack/types';
import {
  completeMultipartBodySchema,
  completeUploadBodySchema,
  confirmMultipartPartBodySchema,
  createBucketBodySchema,
  createFolderBodySchema,
  createLifecyclePolicyBodySchema,
  deleteObjectQuerySchema,
  downloadUrlBodySchema,
  initiateMultipartBodySchema,
  initiateUploadBodySchema,
  listMultipartSessionsQuerySchema,
  listObjectsQuerySchema,
  multipartPartDestinationBodySchema,
  multipartPartParamsSchema,
  objectDestinationBodySchema,
  updateObjectMetadataBodySchema,
  updateBucketVersioningBodySchema,
  updateLifecyclePolicyBodySchema,
  uploadPartQuerySchema,
} from '@vaultstack/validation';
import type { Request, Response } from 'express';
import { requestMeta } from '../../../lib/audit.js';
import { asyncHandler, type AsyncRouteHandler } from '../../../lib/async-handler.js';
import { routeParam } from '../../../lib/route-param.js';
import { StorageScopedController } from '../../../http/storage-scoped.controller.js';
import { readBody } from '../../../middleware/validate.js';

export class StorageController extends StorageScopedController {
  listBuckets: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const buckets = await this.container.storage.buckets.list(this.organizationId(req));
      this.ok(res, { buckets });
    },
  );

  createBucket: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const auth = this.requireAuth(req);
      const body = readBody(req, createBucketBodySchema);
      const bucket = await this.container.storage.buckets.create(
        this.organizationId(req),
        auth.user.id,
        {
          name: body.name,
          region: body.region ?? null,
          versioning: body.versioning,
          storageProviderId: body.storageProviderId,
        },
        requestMeta(req),
      );
      this.created(res, { bucket });
    },
  );

  getBucket: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const bucket = await this.container.storage.buckets.get(
        this.organizationId(req),
        routeParam(req, 'bucketId'),
      );
      this.ok(res, { bucket });
    },
  );

  getBucketSummary: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const summary = await this.container.storage.buckets.getSummary(
        this.organizationId(req),
        routeParam(req, 'bucketId'),
      );
      this.ok(res, { summary });
    },
  );

  createFolder: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const auth = this.requireAuth(req);
      const body = readBody(req, createFolderBodySchema);
      const folder = await this.container.storage.objects.createFolder(
        this.organizationId(req),
        routeParam(req, 'bucketId'),
        body.name,
        body.parentPrefix ?? '',
        auth.user.id,
        requestMeta(req),
      );
      this.created(res, { folder });
    },
  );

  removeBucket: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const auth = this.requireAuth(req);
      await this.container.storage.buckets.remove(
        this.organizationId(req),
        routeParam(req, 'bucketId'),
        auth.user.id,
        requestMeta(req),
      );
      this.noContent(res);
    },
  );

  setBucketVersioning: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const auth = this.requireAuth(req);
      const body = readBody(req, updateBucketVersioningBodySchema);
      const bucket = await this.container.storage.buckets.setVersioning(
        this.organizationId(req),
        routeParam(req, 'bucketId'),
        body.versioning,
        auth.user.id,
        requestMeta(req),
      );
      this.ok(res, { bucket });
    },
  );

  listObjects: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const auth = this.requireAuth(req);
      const query = listObjectsQuerySchema.parse(req.query);
      const page = await this.container.storage.objects.list(
        this.organizationId(req),
        routeParam(req, 'bucketId'),
        {
          prefix: query.prefix,
          search: query.search,
          delimiter: query.delimiter,
          contentType: query.contentType,
          minSize: query.minSize,
          maxSize: query.maxSize,
          modifiedFrom: query.modifiedFrom ? new Date(query.modifiedFrom) : undefined,
          modifiedTo: query.modifiedTo ? new Date(query.modifiedTo) : undefined,
          folderPrefix: query.folderPrefix,
          tag: query.tag,
          externallyShared: query.externallyShared,
          versioned: query.versioned,
          processingState: query.processingState,
          limit: query.limit ?? 100,
          cursor: query.cursor,
          userId: auth.user.id,
        },
      );
      this.ok(res, page);
    },
  );

  getObject: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const auth = this.requireAuth(req);
      const object = await this.container.storage.objects.get(
        this.organizationId(req),
        routeParam(req, 'objectId'),
        auth.user.id,
      );
      this.ok(res, { object });
    },
  );

  updateObjectMetadata: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const auth = this.requireAuth(req);
      const body = readBody(req, updateObjectMetadataBodySchema);
      const object = await this.container.storage.objects.updateMetadata(
        this.organizationId(req),
        routeParam(req, 'objectId'),
        body,
        auth.user.id,
        requestMeta(req),
      );
      this.ok(res, { object });
    },
  );

  createDownloadUrl: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const auth = this.requireAuth(req);
      const body = downloadUrlBodySchema.parse(req.body ?? {});
      const url = await this.container.storage.objects.createDownloadUrl(
        this.organizationId(req),
        routeParam(req, 'objectId'),
        this.container.storage.baseUrl(req),
        body.versionId,
        auth.user.id,
        requestMeta(req),
      );
      this.ok(res, { download: url });
    },
  );

  removeObject: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const auth = this.requireAuth(req);
      const query = deleteObjectQuerySchema.parse(req.query);
      await this.container.storage.objects.remove(
        this.organizationId(req),
        routeParam(req, 'objectId'),
        auth.user.id,
        requestMeta(req),
        query.versionId,
      );
      this.noContent(res);
    },
  );

  copyObject: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
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
    },
  );

  moveObject: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
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
    },
  );

  initiateUpload: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
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
    },
  );

  completeUpload: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
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
    },
  );

  abortUpload: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const auth = this.requireAuth(req);
      await this.container.storage.uploads.abort({
        organizationId: this.organizationId(req),
        uploadId: routeParam(req, 'uploadId'),
        userId: auth.user.id,
        meta: requestMeta(req),
      });
      this.noContent(res);
    },
  );

  initiateMultipart: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const auth = this.requireAuth(req);
      const body = readBody(req, initiateMultipartBodySchema);
      const result = await this.container.storage.uploads.initiateMultipart({
        organizationId: this.organizationId(req),
        bucketId: body.bucketId,
        key: body.key,
        contentType: body.contentType,
        declaredSize: body.size,
        userId: auth.user.id,
        meta: requestMeta(req),
      });
      this.created(res, result);
    },
  );

  listMultipartSessions: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const auth = this.requireAuth(req);
      const query = listMultipartSessionsQuerySchema.parse(req.query);
      const page = await this.container.storage.uploads.listMultipartSessions({
        organizationId: this.organizationId(req),
        userId: auth.user.id,
        status: query.status,
        limit: query.limit,
        cursor: query.cursor,
      });
      this.ok(res, page);
    },
  );

  getMultipartSession: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const auth = this.requireAuth(req);
      const session = await this.container.storage.uploads.getMultipartSession({
        organizationId: this.organizationId(req),
        uploadId: routeParam(req, 'uploadId'),
        userId: auth.user.id,
      });
      this.ok(res, { session });
    },
  );

  listMultipartParts: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const auth = this.requireAuth(req);
      const parts = await this.container.storage.uploads.listMultipartParts({
        organizationId: this.organizationId(req),
        uploadId: routeParam(req, 'uploadId'),
        userId: auth.user.id,
      });
      this.ok(res, { parts });
    },
  );

  createPartDestination: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const auth = this.requireAuth(req);
      const params = multipartPartParamsSchema.parse({
        uploadId: routeParam(req, 'uploadId'),
        partNumber: routeParam(req, 'partNumber'),
      });
      const body = readBody(req, multipartPartDestinationBodySchema);
      const destination = await this.container.storage.uploads.createPartDestination({
        organizationId: this.organizationId(req),
        uploadId: params.uploadId,
        userId: auth.user.id,
        partNumber: params.partNumber,
        size: body.size,
        checksumSha256: body.checksumSha256,
        baseUrl: this.container.storage.baseUrl(req),
        meta: requestMeta(req),
      });
      this.ok(res, { destination });
    },
  );

  confirmPart: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const auth = this.requireAuth(req);
      const params = multipartPartParamsSchema.parse({
        uploadId: routeParam(req, 'uploadId'),
        partNumber: routeParam(req, 'partNumber'),
      });
      const body = readBody(req, confirmMultipartPartBodySchema);
      const part = await this.container.storage.uploads.confirmPart({
        organizationId: this.organizationId(req),
        uploadId: params.uploadId,
        userId: auth.user.id,
        partNumber: params.partNumber,
        etag: body.etag,
        size: body.size,
        checksumSha256: body.checksumSha256,
        meta: requestMeta(req),
      });
      this.ok(res, { part });
    },
  );

  uploadPart: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const auth = this.requireAuth(req);
      const { partNumber } = uploadPartQuerySchema.parse(req.query);
      const controller = new AbortController();
      // Abort only if the client disconnects before we finish. `req` emits
      // `close` after a successful body read, which would otherwise cancel a
      // still-running disk write.
      const onClose = (): void => {
        if (!res.writableEnded) {
          controller.abort();
        }
      };
      req.on('aborted', onClose);
      res.on('close', onClose);

      try {
        const part = await this.container.storage.uploads.uploadPart({
          organizationId: this.organizationId(req),
          uploadId: routeParam(req, 'uploadId'),
          userId: auth.user.id,
          partNumber,
          body: req,
          signal: controller.signal,
        });
        this.ok(res, { part });
      } finally {
        req.off('aborted', onClose);
        res.off('close', onClose);
      }
    },
  );

  completeMultipart: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
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
    },
  );

  abortMultipart: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const auth = this.requireAuth(req);
      await this.container.storage.uploads.abortMultipart({
        organizationId: this.organizationId(req),
        uploadId: routeParam(req, 'uploadId'),
        userId: auth.user.id,
        meta: requestMeta(req),
      });
      this.noContent(res);
    },
  );

  listObjectVersions: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const auth = this.requireAuth(req);
      const page = await this.container.storage.objects.listVersions(
        this.organizationId(req),
        routeParam(req, 'objectId'),
        auth.user.id,
      );
      this.ok(res, page);
    },
  );

  getObjectVersion: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const auth = this.requireAuth(req);
      const version = await this.container.storage.objects.getVersion(
        this.organizationId(req),
        routeParam(req, 'objectId'),
        routeParam(req, 'versionId'),
        auth.user.id,
      );
      this.ok(res, { version });
    },
  );

  restoreObjectVersion: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const auth = this.requireAuth(req);
      const object = await this.container.storage.objects.restoreVersion(
        this.organizationId(req),
        routeParam(req, 'objectId'),
        routeParam(req, 'versionId'),
        auth.user.id,
        requestMeta(req),
      );
      this.ok(res, { object });
    },
  );

  deleteObjectVersion: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const auth = this.requireAuth(req);
      await this.container.storage.objects.remove(
        this.organizationId(req),
        routeParam(req, 'objectId'),
        auth.user.id,
        requestMeta(req),
        routeParam(req, 'versionId'),
      );
      this.noContent(res);
    },
  );

  listPolicies: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const policies = await this.container.storage.policies.list(
        this.organizationId(req),
        typeof req.query.bucketId === 'string' ? req.query.bucketId : undefined,
      );
      this.ok(res, { policies });
    },
  );

  createLifecyclePolicy: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const auth = this.requireAuth(req);
      const body = readBody(req, createLifecyclePolicyBodySchema);
      const policy = await this.container.storage.policies.createLifecycle(
        this.organizationId(req),
        auth.user.id,
        {
          name: body.name,
          bucketId: body.bucketId,
          keyPrefix: body.keyPrefix,
          days: body.days,
          lifecycleAction: body.lifecycleAction,
          enabled: body.enabled,
        },
        requestMeta(req),
      );
      this.created(res, { policy });
    },
  );

  getPolicy: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const policy = await this.container.storage.policies.get(
        this.organizationId(req),
        routeParam(req, 'policyId'),
      );
      this.ok(res, { policy });
    },
  );

  updatePolicy: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const auth = this.requireAuth(req);
      const body = readBody(req, updateLifecyclePolicyBodySchema);
      const policy = await this.container.storage.policies.update(
        this.organizationId(req),
        routeParam(req, 'policyId'),
        auth.user.id,
        body,
        requestMeta(req),
      );
      this.ok(res, { policy });
    },
  );

  removePolicy: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const auth = this.requireAuth(req);
      await this.container.storage.policies.remove(
        this.organizationId(req),
        routeParam(req, 'policyId'),
        auth.user.id,
        requestMeta(req),
      );
      this.noContent(res);
    },
  );

  static readonly readPermission = PERMISSIONS.STORAGE_READ;
  static readonly uploadPermission = PERMISSIONS.STORAGE_UPLOAD;
  static readonly deletePermission = PERMISSIONS.STORAGE_DELETE;
}
