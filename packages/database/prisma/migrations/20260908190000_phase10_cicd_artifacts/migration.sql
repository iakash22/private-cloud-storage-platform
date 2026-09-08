-- Phase 10: CI/CD artifact metadata. Object bytes remain in StorageProvider.

CREATE TYPE "ArtifactKind" AS ENUM ('GENERIC', 'PACKAGE', 'LOG', 'ARCHIVE', 'RELEASE', 'BUNDLE');
CREATE TYPE "BuildStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED');
CREATE TYPE "ArtifactVersionStatus" AS ENUM ('PENDING', 'AVAILABLE', 'FAILED');

CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "retentionDays" INTEGER,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Build" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "BuildStatus" NOT NULL DEFAULT 'QUEUED',
    "title" TEXT,
    "gitRef" TEXT,
    "commitSha" TEXT,
    "createdByUserId" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Build_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Artifact" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "buildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ArtifactKind" NOT NULL DEFAULT 'GENERIC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Artifact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ArtifactVersion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "buildId" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "versionLabel" TEXT,
    "status" "ArtifactVersionStatus" NOT NULL DEFAULT 'PENDING',
    "storageObjectId" TEXT,
    "storageUploadId" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "isRelease" BOOLEAN NOT NULL DEFAULT false,
    "releaseTag" TEXT,
    "releasedAt" TIMESTAMP(3),
    "size" BIGINT NOT NULL DEFAULT 0,
    "contentType" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "checksum" TEXT,
    "etag" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArtifactVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Project_organizationId_slug_key" ON "Project"("organizationId", "slug");
CREATE INDEX "Project_organizationId_idx" ON "Project"("organizationId");

CREATE UNIQUE INDEX "Build_projectId_number_key" ON "Build"("projectId", "number");
CREATE INDEX "Build_organizationId_idx" ON "Build"("organizationId");
CREATE INDEX "Build_projectId_idx" ON "Build"("projectId");

CREATE UNIQUE INDEX "Artifact_buildId_name_key" ON "Artifact"("buildId", "name");
CREATE INDEX "Artifact_organizationId_idx" ON "Artifact"("organizationId");
CREATE INDEX "Artifact_projectId_idx" ON "Artifact"("projectId");

CREATE UNIQUE INDEX "ArtifactVersion_artifactId_version_key" ON "ArtifactVersion"("artifactId", "version");
CREATE UNIQUE INDEX "ArtifactVersion_projectId_releaseTag_key" ON "ArtifactVersion"("projectId", "releaseTag");
CREATE INDEX "ArtifactVersion_organizationId_idx" ON "ArtifactVersion"("organizationId");
CREATE INDEX "ArtifactVersion_artifactId_isCurrent_idx" ON "ArtifactVersion"("artifactId", "isCurrent");
CREATE INDEX "ArtifactVersion_projectId_isRelease_idx" ON "ArtifactVersion"("projectId", "isRelease");
CREATE INDEX "ArtifactVersion_organizationId_createdAt_idx" ON "ArtifactVersion"("organizationId", "createdAt");

ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Build" ADD CONSTRAINT "Build_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Build" ADD CONSTRAINT "Build_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Build" ADD CONSTRAINT "Build_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "Build"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ArtifactVersion" ADD CONSTRAINT "ArtifactVersion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArtifactVersion" ADD CONSTRAINT "ArtifactVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArtifactVersion" ADD CONSTRAINT "ArtifactVersion_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "Build"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArtifactVersion" ADD CONSTRAINT "ArtifactVersion_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "Artifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArtifactVersion" ADD CONSTRAINT "ArtifactVersion_storageObjectId_fkey" FOREIGN KEY ("storageObjectId") REFERENCES "StorageObject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
