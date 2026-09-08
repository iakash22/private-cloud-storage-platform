import {
  completeArtifactVersionBodySchema,
  createBuildBodySchema,
  createProjectBodySchema,
  initiateArtifactBodySchema,
  releaseArtifactVersionBodySchema,
  updateBuildBodySchema,
  updateProjectBodySchema,
} from '@vaultstack/validation';
import type { Request, RequestHandler, Response } from 'express';
import { PERMISSIONS, type PermissionKey } from '@vaultstack/types';
import { requestMeta } from '../../../lib/audit.js';
import { asyncHandler, type AsyncRouteHandler } from '../../../lib/async-handler.js';
import { routeParam, optionalRouteParam } from '../../../lib/route-param.js';
import { createRequireOrganizationPermission } from '../../../middleware/authorize.js';
import { currentOrganizationId } from '../../../middleware/organization-context.js';
import { readBody } from '../../../middleware/validate.js';
import { AuthenticatedController } from '../../../http/base.controller.js';

export class ArtifactsController extends AuthenticatedController {
  protected organizationId(req: Request): string {
    return currentOrganizationId(req);
  }

  allow(permission: PermissionKey): RequestHandler {
    return createRequireOrganizationPermission(this.container.authorization, permission);
  }

  listProjects: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const projects = await this.container.artifacts.listProjects(this.organizationId(req));
    this.ok(res, { projects });
  });

  createProject: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const auth = this.requireAuth(req);
    const body = readBody(req, createProjectBodySchema);
    const project = await this.container.artifacts.createProject(
      this.organizationId(req),
      body,
      auth.user.id,
      requestMeta(req),
    );
    this.created(res, { project });
  });

  getProject: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const project = await this.container.artifacts.getProject(
      this.organizationId(req),
      routeParam(req, 'projectId'),
    );
    this.ok(res, { project });
  });

  updateProject: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const auth = this.requireAuth(req);
    const body = readBody(req, updateProjectBodySchema);
    const project = await this.container.artifacts.updateProject(
      this.organizationId(req),
      routeParam(req, 'projectId'),
      body,
      auth.user.id,
      requestMeta(req),
    );
    this.ok(res, { project });
  });

  deleteProject: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const auth = this.requireAuth(req);
    await this.container.artifacts.deleteProject(
      this.organizationId(req),
      routeParam(req, 'projectId'),
      auth.user.id,
      requestMeta(req),
    );
    this.noContent(res);
  });

  listBuilds: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const builds = await this.container.artifacts.listBuilds(
      this.organizationId(req),
      routeParam(req, 'projectId'),
    );
    this.ok(res, { builds });
  });

  createBuild: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const auth = this.requireAuth(req);
    const body = readBody(req, createBuildBodySchema);
    const build = await this.container.artifacts.createBuild(
      this.organizationId(req),
      routeParam(req, 'projectId'),
      body,
      auth.user.id,
      requestMeta(req),
    );
    this.created(res, { build });
  });

  getBuild: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const build = await this.container.artifacts.getBuild(
      this.organizationId(req),
      routeParam(req, 'projectId'),
      routeParam(req, 'buildId'),
    );
    this.ok(res, { build });
  });

  updateBuild: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const auth = this.requireAuth(req);
    const body = readBody(req, updateBuildBodySchema);
    const build = await this.container.artifacts.updateBuild(
      this.organizationId(req),
      routeParam(req, 'projectId'),
      routeParam(req, 'buildId'),
      body,
      auth.user.id,
      requestMeta(req),
    );
    this.ok(res, { build });
  });

  deleteBuild: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const auth = this.requireAuth(req);
    await this.container.artifacts.deleteBuild(
      this.organizationId(req),
      routeParam(req, 'projectId'),
      routeParam(req, 'buildId'),
      auth.user.id,
      requestMeta(req),
    );
    this.noContent(res);
  });

  listProjectArtifacts: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const artifacts = await this.container.artifacts.listProjectArtifacts(
      this.organizationId(req),
      routeParam(req, 'projectId'),
    );
    this.ok(res, { artifacts });
  });

  listReleases: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const releases = await this.container.artifacts.listReleases(
      this.organizationId(req),
      routeParam(req, 'projectId'),
    );
    this.ok(res, { releases });
  });

  listBuildArtifacts: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const artifacts = await this.container.artifacts.listBuildArtifacts(
      this.organizationId(req),
      routeParam(req, 'projectId'),
      routeParam(req, 'buildId'),
    );
    this.ok(res, { artifacts });
  });

  initiateUpload: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const auth = this.requireAuth(req);
    const body = readBody(req, initiateArtifactBodySchema);
    const result = await this.container.artifacts.initiateUpload(
      this.organizationId(req),
      routeParam(req, 'projectId'),
      routeParam(req, 'buildId'),
      body,
      auth.user.id,
      this.container.storage.baseUrl(req),
      requestMeta(req),
    );
    this.created(res, result);
  });

  getArtifact: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const artifact = await this.container.artifacts.getArtifact(
      this.organizationId(req),
      routeParam(req, 'artifactId'),
      optionalRouteParam(req, 'projectId'),
      optionalRouteParam(req, 'buildId'),
    );
    this.ok(res, { artifact });
  });

  listArtifactVersions: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const versions = await this.container.artifacts.listArtifactVersions(
      this.organizationId(req),
      routeParam(req, 'artifactId'),
      optionalRouteParam(req, 'projectId'),
      optionalRouteParam(req, 'buildId'),
    );
    this.ok(res, { versions });
  });

  deleteArtifact: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const auth = this.requireAuth(req);
    await this.container.artifacts.deleteArtifact(
      this.organizationId(req),
      routeParam(req, 'artifactId'),
      auth.user.id,
      requestMeta(req),
      optionalRouteParam(req, 'projectId'),
      optionalRouteParam(req, 'buildId'),
    );
    this.noContent(res);
  });

  getVersion: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const version = await this.container.artifacts.getVersion(
      this.organizationId(req),
      routeParam(req, 'versionId'),
    );
    this.ok(res, { version });
  });

  completeUpload: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const auth = this.requireAuth(req);
    const body = readBody(req, completeArtifactVersionBodySchema);
    const version = await this.container.artifacts.completeUpload(
      this.organizationId(req),
      routeParam(req, 'versionId'),
      auth.user.id,
      body.checksumSha256,
      requestMeta(req),
    );
    this.created(res, { version });
  });

  createDownloadUrl: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const download = await this.container.artifacts.createDownloadUrl(
      this.organizationId(req),
      routeParam(req, 'versionId'),
      this.container.storage.baseUrl(req),
    );
    this.ok(res, { download });
  });

  releaseVersion: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const auth = this.requireAuth(req);
    const body = readBody(req, releaseArtifactVersionBodySchema);
    const version = await this.container.artifacts.releaseVersion(
      this.organizationId(req),
      routeParam(req, 'versionId'),
      body.releaseTag,
      auth.user.id,
      requestMeta(req),
    );
    this.ok(res, { version });
  });

  deleteVersion: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const auth = this.requireAuth(req);
    await this.container.artifacts.deleteVersion(
      this.organizationId(req),
      routeParam(req, 'versionId'),
      auth.user.id,
      requestMeta(req),
    );
    this.noContent(res);
  });

  static readonly readPermission = PERMISSIONS.ARTIFACT_READ;
  static readonly uploadPermission = PERMISSIONS.ARTIFACT_UPLOAD;
  static readonly deletePermission = PERMISSIONS.ARTIFACT_DELETE;
}
