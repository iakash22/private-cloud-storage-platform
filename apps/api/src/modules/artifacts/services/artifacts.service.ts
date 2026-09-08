import {
  ArtifactKind,
  ArtifactVersionStatus,
  BuildStatus,
  Prisma,
  uniqueSlug,
  type Artifact,
  type ArtifactVersion,
  type Build,
  type PrismaClient,
  type Project,
} from '@vaultstack/database';
import type {
  ArtifactKindName,
  BuildStatusName,
  InitiatedArtifactUpload,
  PublicArtifact,
  PublicArtifactVersion,
  PublicBuild,
  PublicPresignedUrl,
  PublicProject,
} from '@vaultstack/types';
import { writeAuditLog } from '../../../lib/audit.js';
import {
  AppError,
  artifactBuildNotFound,
  artifactNotFound,
  artifactProjectNotFound,
  artifactReleaseConflict,
  artifactVersionNotFound,
  conflict,
} from '../../../lib/errors.js';
import type { RequestMeta } from '../../storage/services/bucket.service.js';
import type { StorageModule } from '../../storage/storage.module.js';
import { ARTIFACT_PENDING_MAX_AGE_MS, ARTIFACTS_BUCKET_NAME } from '../domain/constants.js';
import { artifactObjectKey } from '../domain/object-key.js';
import { evaluateArtifactRetention } from '../domain/retention.js';
import {
  serializeArtifact,
  serializeArtifactVersion,
  serializeBuild,
  serializeProject,
} from '../mappers/artifact.mapper.js';

const currentVersionInclude = {
  versions: {
    where: { isCurrent: true },
    orderBy: { version: 'desc' as const },
    take: 1,
  },
};

export class ArtifactsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: StorageModule,
  ) {}

  async listProjects(organizationId: string): Promise<PublicProject[]> {
    const projects = await this.prisma.project.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
    return projects.map(serializeProject);
  }

  async getProject(organizationId: string, projectId: string): Promise<PublicProject> {
    return serializeProject(await this.requireProject(organizationId, projectId));
  }

  async createProject(
    organizationId: string,
    input: { name: string; slug?: string; description?: string; retentionDays?: number | null },
    userId: string,
    meta: RequestMeta,
  ): Promise<PublicProject> {
    const slug = input.slug ?? uniqueSlug(input.name);
    const existing = await this.prisma.project.findFirst({
      where: { organizationId, slug },
    });
    if (existing) {
      throw conflict('A project with that slug already exists');
    }

    const project = await this.prisma.project.create({
      data: {
        organizationId,
        name: input.name,
        slug,
        description: input.description ?? null,
        retentionDays: input.retentionDays ?? null,
        createdByUserId: userId,
      },
    });

    await writeAuditLog(this.prisma, {
      organizationId,
      userId,
      action: 'artifact.project.created',
      resourceType: 'project',
      resourceId: project.id,
      metadata: { name: project.name, slug: project.slug },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return serializeProject(project);
  }

  async updateProject(
    organizationId: string,
    projectId: string,
    input: { name?: string; description?: string | null; retentionDays?: number | null },
    userId: string,
    meta: RequestMeta,
  ): Promise<PublicProject> {
    await this.requireProject(organizationId, projectId);
    const project = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.retentionDays !== undefined ? { retentionDays: input.retentionDays } : {}),
      },
    });

    await writeAuditLog(this.prisma, {
      organizationId,
      userId,
      action: 'artifact.project.updated',
      resourceType: 'project',
      resourceId: projectId,
      metadata: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.retentionDays !== undefined ? { retentionDays: input.retentionDays } : {}),
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return serializeProject(project);
  }

  async deleteProject(
    organizationId: string,
    projectId: string,
    userId: string,
    meta: RequestMeta,
  ): Promise<void> {
    const project = await this.requireProject(organizationId, projectId);
    const versions = await this.prisma.artifactVersion.findMany({
      where: { organizationId, projectId },
    });
    for (const version of versions) {
      await this.deleteVersionRow(version, userId, meta);
    }
    await this.prisma.project.delete({ where: { id: projectId } });

    await writeAuditLog(this.prisma, {
      organizationId,
      userId,
      action: 'artifact.project.deleted',
      resourceType: 'project',
      resourceId: projectId,
      metadata: { name: project.name, slug: project.slug },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }

  async listBuilds(organizationId: string, projectId: string): Promise<PublicBuild[]> {
    await this.requireProject(organizationId, projectId);
    const builds = await this.prisma.build.findMany({
      where: { organizationId, projectId },
      orderBy: { number: 'desc' },
    });
    return builds.map(serializeBuild);
  }

  async getBuild(organizationId: string, projectId: string, buildId: string): Promise<PublicBuild> {
    return serializeBuild(await this.requireBuild(organizationId, projectId, buildId));
  }

  async createBuild(
    organizationId: string,
    projectId: string,
    input: {
      title?: string;
      gitRef?: string;
      commitSha?: string;
      status?: BuildStatusName;
    },
    userId: string,
    meta: RequestMeta,
  ): Promise<PublicBuild> {
    await this.requireProject(organizationId, projectId);
    const status = input.status ?? BuildStatus.QUEUED;
    const timestamps = timestampsForStatus(status, null, null);

    const build = await this.createBuildWithNextNumber({
      organizationId,
      projectId,
      status,
      title: input.title ?? null,
      gitRef: input.gitRef ?? null,
      commitSha: input.commitSha ?? null,
      createdByUserId: userId,
      startedAt: timestamps.startedAt,
      finishedAt: timestamps.finishedAt,
    });

    await writeAuditLog(this.prisma, {
      organizationId,
      userId,
      action: 'artifact.build.created',
      resourceType: 'build',
      resourceId: build.id,
      metadata: { projectId, number: build.number },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return serializeBuild(build);
  }

  async updateBuild(
    organizationId: string,
    projectId: string,
    buildId: string,
    input: {
      title?: string | null;
      gitRef?: string | null;
      commitSha?: string | null;
      status?: BuildStatusName;
    },
    userId: string,
    meta: RequestMeta,
  ): Promise<PublicBuild> {
    const current = await this.requireBuild(organizationId, projectId, buildId);
    const status = input.status ?? current.status;
    const timestamps = timestampsForStatus(status, current.startedAt, current.finishedAt);

    const build = await this.prisma.build.update({
      where: { id: buildId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.gitRef !== undefined ? { gitRef: input.gitRef } : {}),
        ...(input.commitSha !== undefined ? { commitSha: input.commitSha } : {}),
        ...(input.status !== undefined ? { status } : {}),
        startedAt: timestamps.startedAt,
        finishedAt: timestamps.finishedAt,
      },
    });

    await writeAuditLog(this.prisma, {
      organizationId,
      userId,
      action: 'artifact.build.updated',
      resourceType: 'build',
      resourceId: buildId,
      metadata: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.gitRef !== undefined ? { gitRef: input.gitRef } : {}),
        ...(input.commitSha !== undefined ? { commitSha: input.commitSha } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return serializeBuild(build);
  }

  async deleteBuild(
    organizationId: string,
    projectId: string,
    buildId: string,
    userId: string,
    meta: RequestMeta,
  ): Promise<void> {
    await this.requireBuild(organizationId, projectId, buildId);
    const versions = await this.prisma.artifactVersion.findMany({
      where: { organizationId, buildId },
    });
    for (const version of versions) {
      await this.deleteVersionRow(version, userId, meta);
    }
    await this.prisma.build.delete({ where: { id: buildId } });

    await writeAuditLog(this.prisma, {
      organizationId,
      userId,
      action: 'artifact.build.deleted',
      resourceType: 'build',
      resourceId: buildId,
      metadata: { projectId },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }

  async listProjectArtifacts(organizationId: string, projectId: string): Promise<PublicArtifact[]> {
    await this.requireProject(organizationId, projectId);
    const artifacts = await this.prisma.artifact.findMany({
      where: { organizationId, projectId },
      include: currentVersionInclude,
      orderBy: { createdAt: 'desc' },
    });
    return artifacts.map(serializeArtifact);
  }

  async listReleases(organizationId: string, projectId: string): Promise<PublicArtifactVersion[]> {
    await this.requireProject(organizationId, projectId);
    const versions = await this.prisma.artifactVersion.findMany({
      where: { organizationId, projectId, isRelease: true },
      orderBy: { releasedAt: 'desc' },
    });
    return versions.map(serializeArtifactVersion);
  }

  async listBuildArtifacts(
    organizationId: string,
    projectId: string,
    buildId: string,
  ): Promise<PublicArtifact[]> {
    await this.requireBuild(organizationId, projectId, buildId);
    const artifacts = await this.prisma.artifact.findMany({
      where: { organizationId, buildId },
      include: currentVersionInclude,
      orderBy: { name: 'asc' },
    });
    return artifacts.map(serializeArtifact);
  }

  async getArtifact(
    organizationId: string,
    artifactId: string,
    projectId?: string,
    buildId?: string,
  ): Promise<PublicArtifact> {
    const artifact = await this.requireArtifact(organizationId, artifactId, projectId, buildId);
    const current = await this.prisma.artifactVersion.findFirst({
      where: { organizationId, artifactId: artifact.id, isCurrent: true },
    });
    return serializeArtifact({
      ...artifact,
      versions: current ? [current] : [],
    });
  }

  async listArtifactVersions(
    organizationId: string,
    artifactId: string,
    projectId?: string,
    buildId?: string,
  ): Promise<PublicArtifactVersion[]> {
    await this.requireArtifact(organizationId, artifactId, projectId, buildId);
    const versions = await this.prisma.artifactVersion.findMany({
      where: { organizationId, artifactId },
      orderBy: { version: 'desc' },
    });
    return versions.map(serializeArtifactVersion);
  }

  async getVersion(organizationId: string, versionId: string): Promise<PublicArtifactVersion> {
    return serializeArtifactVersion(await this.requireVersion(organizationId, versionId));
  }

  async initiateUpload(
    organizationId: string,
    projectId: string,
    buildId: string,
    input: {
      name: string;
      kind?: ArtifactKindName;
      fileName?: string;
      contentType?: string;
      size?: number;
      versionLabel?: string;
    },
    userId: string,
    baseUrl: string,
    meta: RequestMeta,
  ): Promise<InitiatedArtifactUpload> {
    await this.requireBuild(organizationId, projectId, buildId);
    const artifact = await this.findOrCreateArtifact({
      organizationId,
      projectId,
      buildId,
      name: input.name,
      kind: input.kind ?? ArtifactKind.GENERIC,
    });

    const latest = await this.prisma.artifactVersion.findFirst({
      where: { artifactId: artifact.id },
      orderBy: { version: 'desc' },
    });
    const nextVersion = (latest?.version ?? 0) + 1;
    const fileName = input.fileName ?? input.name;

    const pending = await this.prisma.artifactVersion.create({
      data: {
        organizationId,
        projectId,
        buildId,
        artifactId: artifact.id,
        version: nextVersion,
        versionLabel: input.versionLabel ?? null,
        status: ArtifactVersionStatus.PENDING,
        contentType: input.contentType ?? 'application/octet-stream',
        size: BigInt(input.size ?? 0),
      },
    });

    try {
      const bucket = await this.ensureArtifactsBucket(organizationId, userId, meta);
      const key = artifactObjectKey({
        projectId,
        buildId,
        artifactId: artifact.id,
        versionId: pending.id,
        fileName,
      });
      const initiated = await this.storage.uploads.initiate({
        organizationId,
        bucketId: bucket.id,
        key,
        contentType: input.contentType,
        size: input.size,
        userId,
        baseUrl,
        meta,
      });

      const version = await this.prisma.artifactVersion.update({
        where: { id: pending.id },
        data: { storageUploadId: initiated.upload.id },
      });

      await writeAuditLog(this.prisma, {
        organizationId,
        userId,
        action: 'artifact.upload.initiated',
        resourceType: 'artifact_version',
        resourceId: version.id,
        metadata: { artifactId: artifact.id, buildId, key },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      return {
        artifact: serializeArtifact({ ...artifact, versions: [version] }),
        version: serializeArtifactVersion(version),
        upload: initiated.upload,
        uploadUrl: initiated.uploadUrl,
        method: initiated.method,
        expiresAt: initiated.expiresAt,
        headers: initiated.headers,
      };
    } catch (error) {
      await this.prisma.artifactVersion
        .delete({ where: { id: pending.id } })
        .catch(() => undefined);
      throw error;
    }
  }

  async completeUpload(
    organizationId: string,
    versionId: string,
    userId: string,
    checksumSha256: string | undefined,
    meta: RequestMeta,
  ): Promise<PublicArtifactVersion> {
    const pending = await this.requireVersion(organizationId, versionId);
    if (pending.status === ArtifactVersionStatus.AVAILABLE && pending.storageObjectId) {
      return serializeArtifactVersion(pending);
    }
    if (pending.status !== ArtifactVersionStatus.PENDING || !pending.storageUploadId) {
      throw conflict('Artifact version is not awaiting upload completion');
    }

    const object = await this.storage.uploads.complete({
      organizationId,
      uploadId: pending.storageUploadId,
      userId,
      checksumSha256,
      meta,
    });

    const version = await this.prisma.$transaction(async (tx) => {
      await tx.artifactVersion.updateMany({
        where: { artifactId: pending.artifactId, isCurrent: true },
        data: { isCurrent: false },
      });
      return tx.artifactVersion.update({
        where: { id: pending.id },
        data: {
          status: ArtifactVersionStatus.AVAILABLE,
          storageObjectId: object.id,
          storageUploadId: null,
          isCurrent: true,
          size: BigInt(object.size),
          contentType: object.contentType,
          checksum: object.checksum,
          etag: object.etag,
        },
      });
    });

    await writeAuditLog(this.prisma, {
      organizationId,
      userId,
      action: 'artifact.upload.completed',
      resourceType: 'artifact_version',
      resourceId: version.id,
      metadata: { artifactId: pending.artifactId, storageObjectId: object.id },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return serializeArtifactVersion(version);
  }

  async createDownloadUrl(
    organizationId: string,
    versionId: string,
    baseUrl: string,
  ): Promise<PublicPresignedUrl> {
    const version = await this.requireVersion(organizationId, versionId);
    if (version.status !== ArtifactVersionStatus.AVAILABLE || !version.storageObjectId) {
      throw conflict('Artifact version is not available for download');
    }
    return this.storage.objects.createDownloadUrl(organizationId, version.storageObjectId, baseUrl);
  }

  async releaseVersion(
    organizationId: string,
    versionId: string,
    releaseTag: string | undefined,
    userId: string,
    meta: RequestMeta,
  ): Promise<PublicArtifactVersion> {
    const version = await this.requireVersion(organizationId, versionId);
    if (version.status !== ArtifactVersionStatus.AVAILABLE || !version.storageObjectId) {
      throw conflict('Only available artifact versions can be released');
    }

    const tag = releaseTag ?? `v${version.version}`;
    if (version.isRelease && version.releaseTag === tag) {
      return serializeArtifactVersion(version);
    }

    const duplicate = await this.prisma.artifactVersion.findFirst({
      where: {
        projectId: version.projectId,
        releaseTag: tag,
        id: { not: version.id },
      },
    });
    if (duplicate) {
      throw artifactReleaseConflict();
    }

    let released: ArtifactVersion;
    try {
      released = await this.prisma.artifactVersion.update({
        where: { id: version.id },
        data: {
          isRelease: true,
          releaseTag: tag,
          releasedAt: new Date(),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw artifactReleaseConflict();
      }
      throw error;
    }

    await writeAuditLog(this.prisma, {
      organizationId,
      userId,
      action: 'artifact.version.released',
      resourceType: 'artifact_version',
      resourceId: version.id,
      metadata: { releaseTag: tag, artifactId: version.artifactId },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return serializeArtifactVersion(released);
  }

  async deleteVersion(
    organizationId: string,
    versionId: string,
    userId: string,
    meta: RequestMeta,
  ): Promise<void> {
    const version = await this.requireVersion(organizationId, versionId);
    await this.deleteVersionRow(version, userId, meta);

    await writeAuditLog(this.prisma, {
      organizationId,
      userId,
      action: 'artifact.version.deleted',
      resourceType: 'artifact_version',
      resourceId: versionId,
      metadata: { artifactId: version.artifactId },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }

  async deleteArtifact(
    organizationId: string,
    artifactId: string,
    userId: string,
    meta: RequestMeta,
    projectId?: string,
    buildId?: string,
  ): Promise<void> {
    const artifact = await this.requireArtifact(organizationId, artifactId, projectId, buildId);
    const versions = await this.prisma.artifactVersion.findMany({
      where: { organizationId, artifactId: artifact.id },
    });
    for (const version of versions) {
      await this.deleteVersionRow(version, userId, meta);
    }
    await this.prisma.artifact.delete({ where: { id: artifact.id } });

    await writeAuditLog(this.prisma, {
      organizationId,
      userId,
      action: 'artifact.deleted',
      resourceType: 'artifact',
      resourceId: artifact.id,
      metadata: { name: artifact.name, buildId: artifact.buildId },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }

  async applyRetention(now = new Date()): Promise<{ expired: number }> {
    const projects = await this.prisma.project.findMany({
      select: { id: true, organizationId: true, retentionDays: true },
    });
    const versions = await this.prisma.artifactVersion.findMany({
      select: {
        id: true,
        organizationId: true,
        projectId: true,
        status: true,
        isRelease: true,
        createdAt: true,
      },
    });

    const decisions = evaluateArtifactRetention({
      now,
      pendingMaxAgeMs: ARTIFACT_PENDING_MAX_AGE_MS,
      projects,
      versions,
    });

    let expired = 0;
    for (const decision of decisions) {
      const version = await this.prisma.artifactVersion.findFirst({
        where: { id: decision.versionId, organizationId: decision.organizationId },
      });
      if (!version) {
        continue;
      }
      await this.deleteVersionRow(version, null, {});
      expired += 1;
    }

    return { expired };
  }

  private async requireProject(organizationId: string, projectId: string): Promise<Project> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
    });
    if (!project) {
      throw artifactProjectNotFound();
    }
    return project;
  }

  private async requireBuild(
    organizationId: string,
    projectId: string,
    buildId: string,
  ): Promise<Build> {
    await this.requireProject(organizationId, projectId);
    const build = await this.prisma.build.findFirst({
      where: { id: buildId, organizationId, projectId },
    });
    if (!build) {
      throw artifactBuildNotFound();
    }
    return build;
  }

  private async requireArtifact(
    organizationId: string,
    artifactId: string,
    projectId?: string,
    buildId?: string,
  ): Promise<Artifact> {
    const artifact = await this.prisma.artifact.findFirst({
      where: {
        id: artifactId,
        organizationId,
        ...(projectId ? { projectId } : {}),
        ...(buildId ? { buildId } : {}),
      },
    });
    if (!artifact) {
      throw artifactNotFound();
    }
    return artifact;
  }

  private async requireVersion(
    organizationId: string,
    versionId: string,
  ): Promise<ArtifactVersion> {
    const version = await this.prisma.artifactVersion.findFirst({
      where: { id: versionId, organizationId },
    });
    if (!version) {
      throw artifactVersionNotFound();
    }
    return version;
  }

  private async findOrCreateArtifact(input: {
    organizationId: string;
    projectId: string;
    buildId: string;
    name: string;
    kind: ArtifactKind;
  }): Promise<Artifact> {
    const existing = await this.prisma.artifact.findFirst({
      where: { buildId: input.buildId, name: input.name, organizationId: input.organizationId },
    });
    if (existing) {
      return existing;
    }

    try {
      return await this.prisma.artifact.create({ data: input });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await this.prisma.artifact.findFirst({
          where: {
            buildId: input.buildId,
            name: input.name,
            organizationId: input.organizationId,
          },
        });
        if (raced) {
          return raced;
        }
      }
      throw error;
    }
  }

  private async createBuildWithNextNumber(data: {
    organizationId: string;
    projectId: string;
    status: BuildStatus;
    title: string | null;
    gitRef: string | null;
    commitSha: string | null;
    createdByUserId: string;
    startedAt: Date | null;
    finishedAt: Date | null;
  }): Promise<Build> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const latest = await this.prisma.build.findFirst({
        where: { projectId: data.projectId },
        orderBy: { number: 'desc' },
      });
      try {
        return await this.prisma.build.create({
          data: { ...data, number: (latest?.number ?? 0) + 1 },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          continue;
        }
        throw error;
      }
    }
    throw conflict('Could not allocate a build number');
  }

  private async ensureArtifactsBucket(
    organizationId: string,
    userId: string,
    meta: RequestMeta,
  ): Promise<{ id: string }> {
    try {
      return await this.storage.buckets.getByName(organizationId, ARTIFACTS_BUCKET_NAME);
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== 'STORAGE_BUCKET_NOT_FOUND') {
        throw error;
      }
    }

    try {
      return await this.storage.buckets.create(
        organizationId,
        userId,
        { name: ARTIFACTS_BUCKET_NAME },
        meta,
      );
    } catch (error) {
      if (error instanceof AppError && error.code === 'CONFLICT') {
        return this.storage.buckets.getByName(organizationId, ARTIFACTS_BUCKET_NAME);
      }
      throw error;
    }
  }

  private async deleteVersionRow(
    version: ArtifactVersion,
    userId: string | null,
    meta: RequestMeta,
  ): Promise<void> {
    if (version.storageUploadId) {
      await this.storage.uploads
        .abort({
          organizationId: version.organizationId,
          uploadId: version.storageUploadId,
          userId: userId ?? 'system',
          meta,
        })
        .catch(() => undefined);
    }

    const storageObjectId = version.storageObjectId;
    await this.prisma.artifactVersion.update({
      where: { id: version.id },
      data: { storageObjectId: null, storageUploadId: null },
    });
    await this.prisma.artifactVersion.delete({ where: { id: version.id } });

    if (storageObjectId) {
      await this.storage.objects
        .remove(version.organizationId, storageObjectId, userId ?? 'system', meta)
        .catch(() => undefined);
    }

    if (version.isCurrent) {
      const latest = await this.prisma.artifactVersion.findFirst({
        where: {
          organizationId: version.organizationId,
          artifactId: version.artifactId,
          status: ArtifactVersionStatus.AVAILABLE,
        },
        orderBy: { version: 'desc' },
      });
      if (latest) {
        await this.prisma.artifactVersion.update({
          where: { id: latest.id },
          data: { isCurrent: true },
        });
      }
    }
  }
}

function timestampsForStatus(
  status: BuildStatus,
  startedAt: Date | null,
  finishedAt: Date | null,
): { startedAt: Date | null; finishedAt: Date | null } {
  if (status === BuildStatus.QUEUED) {
    return { startedAt, finishedAt };
  }
  if (status === BuildStatus.RUNNING) {
    return { startedAt: startedAt ?? new Date(), finishedAt: null };
  }
  return {
    startedAt: startedAt ?? new Date(),
    finishedAt: finishedAt ?? new Date(),
  };
}
