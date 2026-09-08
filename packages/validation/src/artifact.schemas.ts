import { z } from 'zod';
import { sha256ChecksumSchema } from './storage.schemas.js';

export const ARTIFACT_KIND_VALUES = [
  'GENERIC',
  'PACKAGE',
  'LOG',
  'ARCHIVE',
  'RELEASE',
  'BUNDLE',
] as const;

export const BUILD_STATUS_VALUES = [
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'CANCELED',
] as const;

export const artifactKindSchema = z.enum(ARTIFACT_KIND_VALUES);
export const buildStatusSchema = z.enum(BUILD_STATUS_VALUES);

export const projectSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase letters, digits, and hyphens');

export const retentionDaysSchema = z.number().int().min(1).max(3650);

export const createProjectBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    slug: projectSlugSchema.optional(),
    description: z.string().trim().max(2000).optional(),
    retentionDays: retentionDaysSchema.nullable().optional(),
  })
  .strict();

export const updateProjectBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    retentionDays: retentionDaysSchema.nullable().optional(),
  })
  .strict();

export const projectIdParamsSchema = z
  .object({
    projectId: z.string().min(1),
  })
  .strict();

export const createBuildBodySchema = z
  .object({
    title: z.string().trim().min(1).max(240).optional(),
    gitRef: z.string().trim().min(1).max(255).optional(),
    commitSha: z
      .string()
      .trim()
      .regex(/^[a-fA-F0-9]{7,64}$/, 'Commit SHA must be a hex digest')
      .optional(),
    status: buildStatusSchema.optional(),
  })
  .strict();

export const updateBuildBodySchema = z
  .object({
    title: z.string().trim().min(1).max(240).nullable().optional(),
    gitRef: z.string().trim().min(1).max(255).nullable().optional(),
    commitSha: z
      .string()
      .trim()
      .regex(/^[a-fA-F0-9]{7,64}$/, 'Commit SHA must be a hex digest')
      .nullable()
      .optional(),
    status: buildStatusSchema.optional(),
  })
  .strict();

export const projectBuildParamsSchema = z
  .object({
    projectId: z.string().min(1),
    buildId: z.string().min(1),
  })
  .strict();

export const artifactFileNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine((value) => !value.includes('\0'), 'File name must not contain null bytes');

export const initiateArtifactBodySchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    kind: artifactKindSchema.optional(),
    fileName: artifactFileNameSchema.optional(),
    contentType: z.string().trim().min(1).max(255).optional(),
    size: z.coerce.number().int().nonnegative().optional(),
    versionLabel: z.string().trim().min(1).max(64).optional(),
  })
  .strict();

export const projectBuildArtifactParamsSchema = z
  .object({
    projectId: z.string().min(1),
    buildId: z.string().min(1),
    artifactId: z.string().min(1),
  })
  .strict();

export const artifactIdParamsSchema = z
  .object({
    artifactId: z.string().min(1),
  })
  .strict();

export const artifactVersionIdParamsSchema = z
  .object({
    versionId: z.string().min(1),
  })
  .strict();

export const completeArtifactVersionBodySchema = z
  .object({
    checksumSha256: sha256ChecksumSchema.optional(),
  })
  .strict();

export const releaseArtifactVersionBodySchema = z
  .object({
    releaseTag: z.string().trim().min(1).max(128).optional(),
  })
  .strict();

export type CreateProjectBody = z.infer<typeof createProjectBodySchema>;
export type UpdateProjectBody = z.infer<typeof updateProjectBodySchema>;
export type CreateBuildBody = z.infer<typeof createBuildBodySchema>;
export type UpdateBuildBody = z.infer<typeof updateBuildBodySchema>;
export type InitiateArtifactBody = z.infer<typeof initiateArtifactBodySchema>;
export type CompleteArtifactVersionBody = z.infer<typeof completeArtifactVersionBodySchema>;
export type ReleaseArtifactVersionBody = z.infer<typeof releaseArtifactVersionBodySchema>;
