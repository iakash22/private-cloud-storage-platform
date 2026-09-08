import { PERMISSIONS } from '@vaultstack/types';
import {
  bucketIdParamsSchema,
  completeMultipartBodySchema,
  completeUploadBodySchema,
  confirmMultipartPartBodySchema,
  createBucketBodySchema,
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
  objectIdParamsSchema,
  objectVersionParamsSchema,
  storagePolicyIdParamsSchema,
  updateBucketVersioningBodySchema,
  updateLifecyclePolicyBodySchema,
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
  router.put(
    '/buckets/:bucketId/versioning',
    validateParams(bucketIdParamsSchema),
    validateBody(updateBucketVersioningBodySchema),
    controller.allow(PERMISSIONS.STORAGE_UPLOAD),
    controller.setBucketVersioning,
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
    validateBody(downloadUrlBodySchema),
    controller.allow(PERMISSIONS.STORAGE_READ),
    controller.createDownloadUrl,
  );
  router.delete(
    '/objects/:objectId',
    validateParams(objectIdParamsSchema),
    validateQuery(deleteObjectQuerySchema),
    controller.allow(PERMISSIONS.STORAGE_DELETE),
    controller.removeObject,
  );
  router.get(
    '/objects/:objectId/versions',
    validateParams(objectIdParamsSchema),
    controller.allow(PERMISSIONS.STORAGE_READ),
    controller.listObjectVersions,
  );
  router.get(
    '/objects/:objectId/versions/:versionId',
    validateParams(objectVersionParamsSchema),
    controller.allow(PERMISSIONS.STORAGE_READ),
    controller.getObjectVersion,
  );
  router.post(
    '/objects/:objectId/versions/:versionId/restore',
    validateParams(objectVersionParamsSchema),
    controller.allow(PERMISSIONS.STORAGE_UPLOAD),
    controller.restoreObjectVersion,
  );
  router.delete(
    '/objects/:objectId/versions/:versionId',
    validateParams(objectVersionParamsSchema),
    controller.allow(PERMISSIONS.STORAGE_DELETE),
    controller.deleteObjectVersion,
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

  router.get(
    '/multipart-uploads',
    validateQuery(listMultipartSessionsQuerySchema),
    controller.allow(PERMISSIONS.STORAGE_READ),
    controller.listMultipartSessions,
  );
  router.post(
    '/multipart-uploads',
    validateBody(initiateMultipartBodySchema),
    controller.allow(PERMISSIONS.STORAGE_UPLOAD),
    controller.initiateMultipart,
  );
  router.get(
    '/multipart-uploads/:uploadId',
    validateParams(uploadIdParamsSchema),
    controller.allow(PERMISSIONS.STORAGE_READ),
    controller.getMultipartSession,
  );
  router.get(
    '/multipart-uploads/:uploadId/parts',
    validateParams(uploadIdParamsSchema),
    controller.allow(PERMISSIONS.STORAGE_READ),
    controller.listMultipartParts,
  );
  router.put(
    '/multipart-uploads/:uploadId/parts',
    validateParams(uploadIdParamsSchema),
    validateQuery(uploadPartQuerySchema),
    controller.allow(PERMISSIONS.STORAGE_UPLOAD),
    controller.uploadPart,
  );
  router.post(
    '/multipart-uploads/:uploadId/parts/:partNumber/destination',
    validateParams(multipartPartParamsSchema),
    validateBody(multipartPartDestinationBodySchema),
    controller.allow(PERMISSIONS.STORAGE_UPLOAD),
    controller.createPartDestination,
  );
  router.post(
    '/multipart-uploads/:uploadId/parts/:partNumber/confirm',
    validateParams(multipartPartParamsSchema),
    validateBody(confirmMultipartPartBodySchema),
    controller.allow(PERMISSIONS.STORAGE_UPLOAD),
    controller.confirmPart,
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

  router.get(
    '/policies',
    controller.allow(PERMISSIONS.STORAGE_READ),
    controller.listPolicies,
  );
  router.post(
    '/policies',
    validateBody(createLifecyclePolicyBodySchema),
    controller.allow(PERMISSIONS.STORAGE_UPLOAD),
    controller.createLifecyclePolicy,
  );
  router.get(
    '/policies/:policyId',
    validateParams(storagePolicyIdParamsSchema),
    controller.allow(PERMISSIONS.STORAGE_READ),
    controller.getPolicy,
  );
  router.patch(
    '/policies/:policyId',
    validateParams(storagePolicyIdParamsSchema),
    validateBody(updateLifecyclePolicyBodySchema),
    controller.allow(PERMISSIONS.STORAGE_UPLOAD),
    controller.updatePolicy,
  );
  router.delete(
    '/policies/:policyId',
    validateParams(storagePolicyIdParamsSchema),
    controller.allow(PERMISSIONS.STORAGE_DELETE),
    controller.removePolicy,
  );

  return router;
}
