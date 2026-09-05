import { PERMISSIONS } from '@vaultstack/types';
import {
  bucketIdParamsSchema,
  completeMultipartBodySchema,
  completeUploadBodySchema,
  createBucketBodySchema,
  initiateMultipartBodySchema,
  initiateUploadBodySchema,
  listObjectsQuerySchema,
  objectDestinationBodySchema,
  objectIdParamsSchema,
  uploadIdParamsSchema,
  uploadPartQuerySchema,
} from '@vaultstack/validation';
import { Router } from 'express';
import { requestMeta } from '../../../lib/audit.js';
import { asyncHandler } from '../../../lib/async-handler.js';
import { routeParam } from '../../../lib/route-param.js';
import { requireAuth } from '../../../middleware/authenticate.js';
import { createRequireOrganizationPermission } from '../../../middleware/authorize.js';
import {
  currentOrganizationId,
  requireOrganizationContext,
} from '../../../middleware/organization-context.js';
import {
  readBody,
  validateBody,
  validateParams,
  validateQuery,
} from '../../../middleware/validate.js';
import type { StorageServices } from '../storage.services.js';

/**
 * Storage REST API.
 *
 * Every route runs authentication (mounted by the v1 router), organization
 * resolution, an RBAC permission check, and finally an organization-scoped
 * resource lookup. Bucket and object ids are therefore authorization
 * boundaries, not direct handles to storage.
 */
export function createStorageRouter(services: StorageServices): Router {
  const router = Router();
  const allow = (permission: string) =>
    createRequireOrganizationPermission(services.authorization, permission);

  // Applies to every storage route, including the token-authorized content
  // routes, which additionally verify their own scoped token.
  router.use(requireOrganizationContext);

  // --- buckets ---------------------------------------------------------

  router.get(
    '/buckets',
    allow(PERMISSIONS.STORAGE_READ),
    asyncHandler(async (req, res) => {
      const buckets = await services.buckets.list(currentOrganizationId(req));
      res.status(200).json({ buckets });
    }),
  );

  router.post(
    '/buckets',
    validateBody(createBucketBodySchema),
    allow(PERMISSIONS.STORAGE_UPLOAD),
    asyncHandler(async (req, res) => {
      const auth = requireAuth(req);
      const body = readBody(req, createBucketBodySchema);

      const bucket = await services.buckets.create(
        currentOrganizationId(req),
        auth.user.id,
        { name: body.name, region: body.region ?? null, versioning: body.versioning },
        requestMeta(req),
      );

      res.status(201).json({ bucket });
    }),
  );

  router.get(
    '/buckets/:bucketId',
    validateParams(bucketIdParamsSchema),
    allow(PERMISSIONS.STORAGE_READ),
    asyncHandler(async (req, res) => {
      const bucket = await services.buckets.get(
        currentOrganizationId(req),
        routeParam(req, 'bucketId'),
      );
      res.status(200).json({ bucket });
    }),
  );

  router.delete(
    '/buckets/:bucketId',
    validateParams(bucketIdParamsSchema),
    allow(PERMISSIONS.STORAGE_DELETE),
    asyncHandler(async (req, res) => {
      const auth = requireAuth(req);
      await services.buckets.remove(
        currentOrganizationId(req),
        routeParam(req, 'bucketId'),
        auth.user.id,
        requestMeta(req),
      );
      res.status(204).send();
    }),
  );

  // --- object listing --------------------------------------------------

  router.get(
    '/buckets/:bucketId/objects',
    validateParams(bucketIdParamsSchema),
    validateQuery(listObjectsQuerySchema),
    allow(PERMISSIONS.STORAGE_READ),
    asyncHandler(async (req, res) => {
      const query = listObjectsQuerySchema.parse(req.query);

      const page = await services.objects.list(
        currentOrganizationId(req),
        routeParam(req, 'bucketId'),
        {
          prefix: query.prefix,
          delimiter: query.delimiter,
          limit: query.limit ?? 100,
          cursor: query.cursor,
        },
      );

      res.status(200).json(page);
    }),
  );

  // --- objects ---------------------------------------------------------

  router.get(
    '/objects/:objectId',
    validateParams(objectIdParamsSchema),
    allow(PERMISSIONS.STORAGE_READ),
    asyncHandler(async (req, res) => {
      const object = await services.objects.get(
        currentOrganizationId(req),
        routeParam(req, 'objectId'),
      );
      res.status(200).json({ object });
    }),
  );

  router.post(
    '/objects/:objectId/download-url',
    validateParams(objectIdParamsSchema),
    allow(PERMISSIONS.STORAGE_READ),
    asyncHandler(async (req, res) => {
      const url = await services.objects.createDownloadUrl(
        currentOrganizationId(req),
        routeParam(req, 'objectId'),
        services.baseUrl(req),
      );
      res.status(200).json({ download: url });
    }),
  );

  router.delete(
    '/objects/:objectId',
    validateParams(objectIdParamsSchema),
    allow(PERMISSIONS.STORAGE_DELETE),
    asyncHandler(async (req, res) => {
      const auth = requireAuth(req);
      await services.objects.remove(
        currentOrganizationId(req),
        routeParam(req, 'objectId'),
        auth.user.id,
        requestMeta(req),
      );
      res.status(204).send();
    }),
  );

  router.post(
    '/objects/:objectId/copy',
    validateParams(objectIdParamsSchema),
    validateBody(objectDestinationBodySchema),
    allow(PERMISSIONS.STORAGE_UPLOAD),
    asyncHandler(async (req, res) => {
      const auth = requireAuth(req);
      const body = readBody(req, objectDestinationBodySchema);

      const object = await services.objects.copy({
        organizationId: currentOrganizationId(req),
        objectId: routeParam(req, 'objectId'),
        destinationBucketId: body.destinationBucketId,
        destinationKey: body.destinationKey,
        userId: auth.user.id,
        meta: requestMeta(req),
      });

      res.status(201).json({ object });
    }),
  );

  /**
   * Moving removes the source, so it requires delete as well as upload. The
   * two guards run in sequence and both must pass.
   */
  router.post(
    '/objects/:objectId/move',
    validateParams(objectIdParamsSchema),
    validateBody(objectDestinationBodySchema),
    allow(PERMISSIONS.STORAGE_UPLOAD),
    allow(PERMISSIONS.STORAGE_DELETE),
    asyncHandler(async (req, res) => {
      const auth = requireAuth(req);
      const body = readBody(req, objectDestinationBodySchema);

      const object = await services.objects.move({
        organizationId: currentOrganizationId(req),
        objectId: routeParam(req, 'objectId'),
        destinationBucketId: body.destinationBucketId,
        destinationKey: body.destinationKey,
        userId: auth.user.id,
        meta: requestMeta(req),
      });

      res.status(200).json({ object });
    }),
  );

  // --- uploads ---------------------------------------------------------

  router.post(
    '/uploads/initiate',
    validateBody(initiateUploadBodySchema),
    allow(PERMISSIONS.STORAGE_UPLOAD),
    asyncHandler(async (req, res) => {
      const auth = requireAuth(req);
      const body = readBody(req, initiateUploadBodySchema);

      const result = await services.uploads.initiate({
        organizationId: currentOrganizationId(req),
        bucketId: body.bucketId,
        key: body.key,
        contentType: body.contentType,
        size: body.size,
        userId: auth.user.id,
        baseUrl: services.baseUrl(req),
        meta: requestMeta(req),
      });

      res.status(201).json(result);
    }),
  );

  router.post(
    '/uploads/:uploadId/complete',
    validateParams(uploadIdParamsSchema),
    validateBody(completeUploadBodySchema),
    allow(PERMISSIONS.STORAGE_UPLOAD),
    asyncHandler(async (req, res) => {
      const auth = requireAuth(req);
      const body = readBody(req, completeUploadBodySchema);

      const object = await services.uploads.complete({
        organizationId: currentOrganizationId(req),
        uploadId: routeParam(req, 'uploadId'),
        userId: auth.user.id,
        checksumSha256: body.checksumSha256,
        meta: requestMeta(req),
      });

      res.status(201).json({ object });
    }),
  );

  router.delete(
    '/uploads/:uploadId',
    validateParams(uploadIdParamsSchema),
    allow(PERMISSIONS.STORAGE_UPLOAD),
    asyncHandler(async (req, res) => {
      const auth = requireAuth(req);
      await services.uploads.abort({
        organizationId: currentOrganizationId(req),
        uploadId: routeParam(req, 'uploadId'),
        userId: auth.user.id,
        meta: requestMeta(req),
      });
      res.status(204).send();
    }),
  );

  // --- multipart -------------------------------------------------------

  router.post(
    '/multipart-uploads',
    validateBody(initiateMultipartBodySchema),
    allow(PERMISSIONS.STORAGE_UPLOAD),
    asyncHandler(async (req, res) => {
      const auth = requireAuth(req);
      const body = readBody(req, initiateMultipartBodySchema);

      const result = await services.uploads.initiateMultipart({
        organizationId: currentOrganizationId(req),
        bucketId: body.bucketId,
        key: body.key,
        contentType: body.contentType,
        userId: auth.user.id,
        meta: requestMeta(req),
      });

      res.status(201).json(result);
    }),
  );

  router.put(
    '/multipart-uploads/:uploadId/parts',
    validateParams(uploadIdParamsSchema),
    validateQuery(uploadPartQuerySchema),
    allow(PERMISSIONS.STORAGE_UPLOAD),
    asyncHandler(async (req, res) => {
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
        const part = await services.uploads.uploadPart({
          organizationId: currentOrganizationId(req),
          uploadId: routeParam(req, 'uploadId'),
          partNumber,
          body: req,
          signal: controller.signal,
        });

        res.status(200).json({ part });
      } finally {
        req.off('aborted', onClose);
        req.off('close', onClose);
      }
    }),
  );

  router.post(
    '/multipart-uploads/:uploadId/complete',
    validateParams(uploadIdParamsSchema),
    validateBody(completeMultipartBodySchema),
    allow(PERMISSIONS.STORAGE_UPLOAD),
    asyncHandler(async (req, res) => {
      const auth = requireAuth(req);
      const body = readBody(req, completeMultipartBodySchema);

      const object = await services.uploads.completeMultipart({
        organizationId: currentOrganizationId(req),
        uploadId: routeParam(req, 'uploadId'),
        userId: auth.user.id,
        parts: body.parts,
        meta: requestMeta(req),
      });

      res.status(201).json({ object });
    }),
  );

  router.delete(
    '/multipart-uploads/:uploadId',
    validateParams(uploadIdParamsSchema),
    allow(PERMISSIONS.STORAGE_UPLOAD),
    asyncHandler(async (req, res) => {
      const auth = requireAuth(req);
      await services.uploads.abortMultipart({
        organizationId: currentOrganizationId(req),
        uploadId: routeParam(req, 'uploadId'),
        userId: auth.user.id,
        meta: requestMeta(req),
      });
      res.status(204).send();
    }),
  );

  return router;
}
