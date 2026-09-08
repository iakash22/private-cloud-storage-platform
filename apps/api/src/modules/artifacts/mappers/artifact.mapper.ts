import type {
  ArtifactKindName,
  ArtifactVersionStatusName,
  BuildStatusName,
  PublicArtifact,
  PublicArtifactVersion,
  PublicBuild,
  PublicProject,
} from '@vaultstack/types';

export function serializeProject(project: {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  retentionDays: number | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): PublicProject {
  return {
    id: project.id,
    organizationId: project.organizationId,
    name: project.name,
    slug: project.slug,
    description: project.description,
    retentionDays: project.retentionDays,
    createdByUserId: project.createdByUserId,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

export function serializeBuild(build: {
  id: string;
  organizationId: string;
  projectId: string;
  number: number;
  status: string;
  title: string | null;
  gitRef: string | null;
  commitSha: string | null;
  createdByUserId: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): PublicBuild {
  return {
    id: build.id,
    organizationId: build.organizationId,
    projectId: build.projectId,
    number: build.number,
    status: build.status as BuildStatusName,
    title: build.title,
    gitRef: build.gitRef,
    commitSha: build.commitSha,
    createdByUserId: build.createdByUserId,
    startedAt: build.startedAt?.toISOString() ?? null,
    finishedAt: build.finishedAt?.toISOString() ?? null,
    createdAt: build.createdAt.toISOString(),
    updatedAt: build.updatedAt.toISOString(),
  };
}

export function serializeArtifactVersion(version: {
  id: string;
  organizationId: string;
  projectId: string;
  buildId: string;
  artifactId: string;
  version: number;
  versionLabel: string | null;
  status: string;
  storageObjectId: string | null;
  isCurrent: boolean;
  isRelease: boolean;
  releaseTag: string | null;
  releasedAt: Date | null;
  size: bigint;
  contentType: string;
  checksum: string | null;
  etag: string | null;
  createdAt: Date;
  updatedAt: Date;
}): PublicArtifactVersion {
  return {
    id: version.id,
    organizationId: version.organizationId,
    projectId: version.projectId,
    buildId: version.buildId,
    artifactId: version.artifactId,
    version: version.version,
    versionLabel: version.versionLabel,
    status: version.status as ArtifactVersionStatusName,
    storageObjectId: version.storageObjectId,
    isCurrent: version.isCurrent,
    isRelease: version.isRelease,
    releaseTag: version.releaseTag,
    releasedAt: version.releasedAt?.toISOString() ?? null,
    size: Number(version.size),
    contentType: version.contentType,
    checksum: version.checksum,
    etag: version.etag,
    createdAt: version.createdAt.toISOString(),
    updatedAt: version.updatedAt.toISOString(),
  };
}

export function serializeArtifact(artifact: {
  id: string;
  organizationId: string;
  projectId: string;
  buildId: string;
  name: string;
  kind: string;
  createdAt: Date;
  updatedAt: Date;
  versions?: Parameters<typeof serializeArtifactVersion>[0][];
}): PublicArtifact {
  const current = artifact.versions?.find((version) => version.isCurrent) ?? null;
  return {
    id: artifact.id,
    organizationId: artifact.organizationId,
    projectId: artifact.projectId,
    buildId: artifact.buildId,
    name: artifact.name,
    kind: artifact.kind as ArtifactKindName,
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString(),
    currentVersion: current ? serializeArtifactVersion(current) : null,
  };
}
