import { PERMISSIONS } from '@vaultstack/types';
import {
  bucketIdParamsSchema,
  completeMultipartBodySchema,
  completeUploadBodySchema,
  confirmMultipartPartBodySchema,
  createBucketBodySchema,
  createPreviewBodySchema,
  createLifecyclePolicyBodySchema,
  createShareBodySchema,
  createStorageProviderBodySchema,
  deleteObjectQuerySchema,
  downloadUrlBodySchema,
  initiateMultipartBodySchema,
  initiateUploadBodySchema,
  listMultipartSessionsQuerySchema,
  listObjectsQuerySchema,
  listSharesQuerySchema,
  multipartPartDestinationBodySchema,
  multipartPartParamsSchema,
  objectDestinationBodySchema,
  objectIdParamsSchema,
  objectVersionParamsSchema,
  previewJobIdParamsSchema,
  shareIdParamsSchema,
  storagePolicyIdParamsSchema,
  storageProviderIdParamsSchema,
  updateBucketVersioningBodySchema,
  updateLifecyclePolicyBodySchema,
  updateShareBodySchema,
  updateStorageProviderBodySchema,
  uploadIdParamsSchema,
  uploadPartQuerySchema,
} from '@vaultstack/validation';
import { Router } from 'express';
import type { AppContainer } from '../../container/app-container.js';
import { requireOrganizationContext } from '../../middleware/organization-context.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.js';
import { ShareController } from './controllers/share.controller.js';
import { ProviderController } from './controllers/provider.controller.js';
import { StorageController } from './controllers/storage.controller.js';
import { PreviewController } from '../previews/preview.controller.js';

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
  const shares = new ShareController(container);
  const providers = new ProviderController(container);
  const previews = new PreviewController(container);

  router.use(requireOrganizationContext);

  router.get('/providers', providers.allow(PERMISSIONS.STORAGE_READ), providers.list);
  router.post(
    '/providers',
    validateBody(createStorageProviderBodySchema),
    providers.allow(PERMISSIONS.STORAGE_UPLOAD),
    providers.create,
  );
  router.get(
    '/providers/:providerId',
    validateParams(storageProviderIdParamsSchema),
    providers.allow(PERMISSIONS.STORAGE_READ),
    providers.get,
  );
  router.patch(
    '/providers/:providerId',
    validateParams(storageProviderIdParamsSchema),
    validateBody(updateStorageProviderBodySchema),
    providers.allow(PERMISSIONS.STORAGE_UPLOAD),
    providers.update,
  );
  router.delete(
    '/providers/:providerId',
    validateParams(storageProviderIdParamsSchema),
    providers.allow(PERMISSIONS.STORAGE_DELETE),
    providers.remove,
  );
  router.post(
    '/providers/:providerId/test',
    validateParams(storageProviderIdParamsSchema),
    providers.allow(PERMISSIONS.STORAGE_UPLOAD),
    providers.test,
  );

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
  router.post(
    '/objects/:objectId/previews',
    validateParams(objectIdParamsSchema),
    validateBody(createPreviewBodySchema),
    controller.allow(PERMISSIONS.STORAGE_READ),
    previews.create,
  );
  router.get(
    '/previews/:jobId',
    validateParams(previewJobIdParamsSchema),
    controller.allow(PERMISSIONS.STORAGE_READ),
    previews.get,
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

  router.get('/policies', controller.allow(PERMISSIONS.STORAGE_READ), controller.listPolicies);
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

  router.get(
    '/shares',
    validateQuery(listSharesQuerySchema),
    shares.allow(PERMISSIONS.STORAGE_SHARE),
    shares.list,
  );
  router.post(
    '/objects/:objectId/shares',
    validateParams(objectIdParamsSchema),
    validateBody(createShareBodySchema),
    shares.allow(PERMISSIONS.STORAGE_SHARE),
    shares.create,
  );
  router.get(
    '/shares/:shareId',
    validateParams(shareIdParamsSchema),
    shares.allow(PERMISSIONS.STORAGE_SHARE),
    shares.get,
  );
  router.patch(
    '/shares/:shareId',
    validateParams(shareIdParamsSchema),
    validateBody(updateShareBodySchema),
    shares.allow(PERMISSIONS.STORAGE_SHARE),
    shares.update,
  );
  router.delete(
    '/shares/:shareId',
    validateParams(shareIdParamsSchema),
    shares.allow(PERMISSIONS.STORAGE_SHARE),
    shares.revoke,
  );

  return router;
}
