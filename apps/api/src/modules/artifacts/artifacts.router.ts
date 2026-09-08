import {
  artifactIdParamsSchema,
  artifactVersionIdParamsSchema,
  completeArtifactVersionBodySchema,
  createBuildBodySchema,
  createProjectBodySchema,
  initiateArtifactBodySchema,
  projectBuildArtifactParamsSchema,
  projectBuildParamsSchema,
  projectIdParamsSchema,
  releaseArtifactVersionBodySchema,
  updateBuildBodySchema,
  updateProjectBodySchema,
} from '@vaultstack/validation';
import { Router } from 'express';
import type { AppContainer } from '../../container/app-container.js';
import { requireOrganizationContext } from '../../middleware/organization-context.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import { ArtifactsController } from './controllers/artifacts.controller.js';

/**
 * CI/CD artifact control plane. Organization is resolved from auth context.
 * Object bytes are stored through StorageService, not a second engine.
 */
export function createArtifactsRouter(container: AppContainer): Router {
  const router = Router();
  const controller = new ArtifactsController(container);

  router.use(requireOrganizationContext);

  router.get(
    '/projects',
    controller.allow(ArtifactsController.readPermission),
    controller.listProjects,
  );
  router.post(
    '/projects',
    validateBody(createProjectBodySchema),
    controller.allow(ArtifactsController.uploadPermission),
    controller.createProject,
  );
  router.get(
    '/projects/:projectId',
    validateParams(projectIdParamsSchema),
    controller.allow(ArtifactsController.readPermission),
    controller.getProject,
  );
  router.patch(
    '/projects/:projectId',
    validateParams(projectIdParamsSchema),
    validateBody(updateProjectBodySchema),
    controller.allow(ArtifactsController.uploadPermission),
    controller.updateProject,
  );
  router.delete(
    '/projects/:projectId',
    validateParams(projectIdParamsSchema),
    controller.allow(ArtifactsController.deletePermission),
    controller.deleteProject,
  );

  router.get(
    '/projects/:projectId/builds',
    validateParams(projectIdParamsSchema),
    controller.allow(ArtifactsController.readPermission),
    controller.listBuilds,
  );
  router.post(
    '/projects/:projectId/builds',
    validateParams(projectIdParamsSchema),
    validateBody(createBuildBodySchema),
    controller.allow(ArtifactsController.uploadPermission),
    controller.createBuild,
  );
  router.get(
    '/projects/:projectId/builds/:buildId',
    validateParams(projectBuildParamsSchema),
    controller.allow(ArtifactsController.readPermission),
    controller.getBuild,
  );
  router.patch(
    '/projects/:projectId/builds/:buildId',
    validateParams(projectBuildParamsSchema),
    validateBody(updateBuildBodySchema),
    controller.allow(ArtifactsController.uploadPermission),
    controller.updateBuild,
  );
  router.delete(
    '/projects/:projectId/builds/:buildId',
    validateParams(projectBuildParamsSchema),
    controller.allow(ArtifactsController.deletePermission),
    controller.deleteBuild,
  );

  router.get(
    '/projects/:projectId/artifacts',
    validateParams(projectIdParamsSchema),
    controller.allow(ArtifactsController.readPermission),
    controller.listProjectArtifacts,
  );
  router.get(
    '/projects/:projectId/releases',
    validateParams(projectIdParamsSchema),
    controller.allow(ArtifactsController.readPermission),
    controller.listReleases,
  );

  router.get(
    '/projects/:projectId/builds/:buildId/artifacts',
    validateParams(projectBuildParamsSchema),
    controller.allow(ArtifactsController.readPermission),
    controller.listBuildArtifacts,
  );
  router.post(
    '/projects/:projectId/builds/:buildId/artifacts',
    validateParams(projectBuildParamsSchema),
    validateBody(initiateArtifactBodySchema),
    controller.allow(ArtifactsController.uploadPermission),
    controller.initiateUpload,
  );
  router.get(
    '/projects/:projectId/builds/:buildId/artifacts/:artifactId',
    validateParams(projectBuildArtifactParamsSchema),
    controller.allow(ArtifactsController.readPermission),
    controller.getArtifact,
  );
  router.get(
    '/projects/:projectId/builds/:buildId/artifacts/:artifactId/versions',
    validateParams(projectBuildArtifactParamsSchema),
    controller.allow(ArtifactsController.readPermission),
    controller.listArtifactVersions,
  );
  router.delete(
    '/projects/:projectId/builds/:buildId/artifacts/:artifactId',
    validateParams(projectBuildArtifactParamsSchema),
    controller.allow(ArtifactsController.deletePermission),
    controller.deleteArtifact,
  );

  router.get(
    '/versions/:versionId',
    validateParams(artifactVersionIdParamsSchema),
    controller.allow(ArtifactsController.readPermission),
    controller.getVersion,
  );
  router.post(
    '/versions/:versionId/complete',
    validateParams(artifactVersionIdParamsSchema),
    validateBody(completeArtifactVersionBodySchema),
    controller.allow(ArtifactsController.uploadPermission),
    controller.completeUpload,
  );
  router.post(
    '/versions/:versionId/download-url',
    validateParams(artifactVersionIdParamsSchema),
    controller.allow(ArtifactsController.readPermission),
    controller.createDownloadUrl,
  );
  router.post(
    '/versions/:versionId/release',
    validateParams(artifactVersionIdParamsSchema),
    validateBody(releaseArtifactVersionBodySchema),
    controller.allow(ArtifactsController.uploadPermission),
    controller.releaseVersion,
  );
  router.delete(
    '/versions/:versionId',
    validateParams(artifactVersionIdParamsSchema),
    controller.allow(ArtifactsController.deletePermission),
    controller.deleteVersion,
  );

  router.get(
    '/:artifactId',
    validateParams(artifactIdParamsSchema),
    controller.allow(ArtifactsController.readPermission),
    controller.getArtifact,
  );
  router.get(
    '/:artifactId/versions',
    validateParams(artifactIdParamsSchema),
    controller.allow(ArtifactsController.readPermission),
    controller.listArtifactVersions,
  );
  router.delete(
    '/:artifactId',
    validateParams(artifactIdParamsSchema),
    controller.allow(ArtifactsController.deletePermission),
    controller.deleteArtifact,
  );

  return router;
}
