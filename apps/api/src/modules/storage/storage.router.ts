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
import type { AppContainer } from '../../container/app-container.js';
import { requireOrganizationContext } from '../../middleware/organization-context.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.js';
import { StorageController } from './controllers/storage.controller.js';

/**
 * Storage REST API.
 *
 * Every route runs authentication (mounted by the v1 router), organization
 * resolution, an RBAC permission check, and finally an organization-scoped
 * resource lookup.
 */
export function createStorageRouter(container: AppContainer): Router {
  const router = Router();
  const controller = new StorageController(container);

  router.use(requireOrganizationContext);

  router.get('/buckets', controller.allow(PERMISSIONS.STORAGE_READ), controller.listBuckets);
  router.post(
    '/buckets',
    validateBody(createBucketBodySchema),
    controller.allow(PERMISSIONS.STORAGE_UPLOAD),
    controller.createBucket,
  );
  router.get(
    '/buckets/:bucketId',
    validateParams(bucketIdParamsSchema),
    controller.allow(PERMISSIONS.STORAGE_READ),
    controller.getBucket,
  );
  router.delete(
    '/buckets/:bucketId',
    validateParams(bucketIdParamsSchema),
    controller.allow(PERMISSIONS.STORAGE_DELETE),
    controller.removeBucket,
  );

  router.get(
    '/buckets/:bucketId/objects',
    validateParams(bucketIdParamsSchema),
    validateQuery(listObjectsQuerySchema),
    controller.allow(PERMISSIONS.STORAGE_READ),
    controller.listObjects,
  );

  router.get(
    '/objects/:objectId',
    validateParams(objectIdParamsSchema),
    controller.allow(PERMISSIONS.STORAGE_READ),
    controller.getObject,
  );
  router.post(
    '/objects/:objectId/download-url',
    validateParams(objectIdParamsSchema),
    controller.allow(PERMISSIONS.STORAGE_READ),
    controller.createDownloadUrl,
  );
  router.delete(
    '/objects/:objectId',
    validateParams(objectIdParamsSchema),
    controller.allow(PERMISSIONS.STORAGE_DELETE),
    controller.removeObject,
  );
  router.post(
    '/objects/:objectId/copy',
    validateParams(objectIdParamsSchema),
    validateBody(objectDestinationBodySchema),
    controller.allow(PERMISSIONS.STORAGE_UPLOAD),
    controller.copyObject,
  );
  router.post(
    '/objects/:objectId/move',
    validateParams(objectIdParamsSchema),
    validateBody(objectDestinationBodySchema),
    controller.allow(PERMISSIONS.STORAGE_UPLOAD),
    controller.allow(PERMISSIONS.STORAGE_DELETE),
    controller.moveObject,
  );

  router.post(
    '/uploads/initiate',
    validateBody(initiateUploadBodySchema),
    controller.allow(PERMISSIONS.STORAGE_UPLOAD),
    controller.initiateUpload,
  );
  router.post(
    '/uploads/:uploadId/complete',
    validateParams(uploadIdParamsSchema),
    validateBody(completeUploadBodySchema),
    controller.allow(PERMISSIONS.STORAGE_UPLOAD),
    controller.completeUpload,
  );
  router.delete(
    '/uploads/:uploadId',
    validateParams(uploadIdParamsSchema),
    controller.allow(PERMISSIONS.STORAGE_UPLOAD),
    controller.abortUpload,
  );

  router.post(
    '/multipart-uploads',
    validateBody(initiateMultipartBodySchema),
    controller.allow(PERMISSIONS.STORAGE_UPLOAD),
    controller.initiateMultipart,
  );
  router.put(
    '/multipart-uploads/:uploadId/parts',
    validateParams(uploadIdParamsSchema),
    validateQuery(uploadPartQuerySchema),
    controller.allow(PERMISSIONS.STORAGE_UPLOAD),
    controller.uploadPart,
  );
  router.post(
    '/multipart-uploads/:uploadId/complete',
    validateParams(uploadIdParamsSchema),
    validateBody(completeMultipartBodySchema),
    controller.allow(PERMISSIONS.STORAGE_UPLOAD),
    controller.completeMultipart,
  );
  router.delete(
    '/multipart-uploads/:uploadId',
    validateParams(uploadIdParamsSchema),
    controller.allow(PERMISSIONS.STORAGE_UPLOAD),
    controller.abortMultipart,
  );

  return router;
}
