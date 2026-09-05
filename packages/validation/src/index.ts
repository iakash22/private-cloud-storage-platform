import { z } from 'zod';

export const healthStatusSchema = z.enum(['ok', 'degraded', 'error']);

export const healthResponseSchema = z.object({
  status: healthStatusSchema,
  service: z.string(),
  timestamp: z.string().datetime(),
  uptime: z.number().nonnegative(),
});

export const dependencyCheckSchema = z.object({
  name: z.string(),
  status: healthStatusSchema,
  message: z.string().optional(),
});

export const readinessResponseSchema = z.object({
  status: healthStatusSchema,
  service: z.string(),
  timestamp: z.string().datetime(),
  checks: z.array(dependencyCheckSchema),
});

export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
  requestId: z.string(),
});

export const emailSchema = z
  .string()
  .trim()
  .email()
  .transform((value) => value.toLowerCase());
export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[A-Za-z]/, 'Password must include a letter')
  .regex(/[0-9]/, 'Password must include a number');
export const nameSchema = z.string().trim().min(1).max(120);
export const organizationNameSchema = z.string().trim().min(1).max(120);

export const registerBodySchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
  organizationName: organizationNameSchema,
});

export const loginBodySchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export const createOrganizationBodySchema = z.object({
  name: organizationNameSchema,
});

export const updateOrganizationBodySchema = z.object({
  name: organizationNameSchema,
});

export const organizationIdParamsSchema = z.object({
  organizationId: z.string().min(1),
});

export const createUserBodySchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
  roleId: z.string().min(1).optional(),
});

export const userIdParamsSchema = z.object({
  userId: z.string().min(1),
});

export const organizationUserParamsSchema = z.object({
  organizationId: z.string().min(1),
  userId: z.string().min(1),
});

export const updateUserBodySchema = z.object({
  name: nameSchema.optional(),
  password: passwordSchema.optional(),
  disabled: z.boolean().optional(),
});

export const createTeamBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const updateTeamBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const teamIdParamsSchema = z.object({
  teamId: z.string().min(1),
});

export const organizationTeamParamsSchema = z.object({
  organizationId: z.string().min(1),
  teamId: z.string().min(1),
});

export const createRoleBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(240).optional(),
  permissions: z.array(z.string().min(1)).min(1),
});

export const updateRoleBodySchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(240).nullable().optional(),
  permissions: z.array(z.string().min(1)).min(1).optional(),
});

export const roleIdParamsSchema = z.object({
  roleId: z.string().min(1),
});

export const organizationRoleParamsSchema = z.object({
  organizationId: z.string().min(1),
  roleId: z.string().min(1),
});

export const assignRoleBodySchema = z.object({
  roleId: z.string().min(1),
});

export const userRoleParamsSchema = z.object({
  organizationId: z.string().min(1),
  userId: z.string().min(1),
  roleId: z.string().min(1),
});

export const createApiKeyBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  expiresAt: z.string().datetime().optional(),
});

export const apiKeyIdParamsSchema = z.object({
  organizationId: z.string().min(1),
  apiKeyId: z.string().min(1),
});

export const auditLogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

// --- storage (Phase 3) -----------------------------------------------------
//
// These schemas validate request *shape*. Bucket-name and object-key rules are
// enforced in the storage domain layer so violations surface as the stable
// STORAGE_INVALID_BUCKET_NAME / STORAGE_INVALID_KEY error codes.

export const selectOrganizationBodySchema = z.object({
  organizationId: z.string().min(1),
});

export const bucketNameSchema = z.string().trim().min(3).max(63);
export const objectKeySchema = z.string().min(1).max(1024);

export const createBucketBodySchema = z.object({
  name: bucketNameSchema,
  region: z.string().trim().min(1).max(64).optional(),
  versioning: z.enum(['UNVERSIONED', 'ENABLED']).optional(),
});

export const bucketIdParamsSchema = z.object({
  bucketId: z.string().min(1),
});

export const objectIdParamsSchema = z.object({
  objectId: z.string().min(1),
});

export const uploadIdParamsSchema = z.object({
  uploadId: z.string().min(1),
});

export const listObjectsQuerySchema = z.object({
  prefix: z.string().max(1024).optional(),
  delimiter: z.string().max(8).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  cursor: z.string().max(1024).optional(),
});

export const initiateUploadBodySchema = z.object({
  bucketId: z.string().min(1),
  key: objectKeySchema,
  contentType: z.string().trim().min(1).max(255).optional(),
  size: z.coerce.number().int().nonnegative().optional(),
});

export const completeUploadBodySchema = z.object({
  checksumSha256: z
    .string()
    .regex(/^[a-fA-F0-9]{64}$/, 'Checksum must be a hex-encoded SHA-256 digest')
    .optional(),
});

export const uploadContentQuerySchema = z.object({
  token: z.string().min(1),
});

export const objectDestinationBodySchema = z.object({
  destinationBucketId: z.string().min(1),
  destinationKey: objectKeySchema,
});

export const initiateMultipartBodySchema = z.object({
  bucketId: z.string().min(1),
  key: objectKeySchema,
  contentType: z.string().trim().min(1).max(255).optional(),
});

export const uploadPartQuerySchema = z.object({
  partNumber: z.coerce.number().int().min(1).max(10_000),
});

export const completeMultipartBodySchema = z.object({
  parts: z
    .array(
      z.object({
        partNumber: z.coerce.number().int().min(1).max(10_000),
        etag: z.string().min(1).max(256),
      }),
    )
    .min(1)
    .max(10_000),
});

export type HealthResponseInput = z.infer<typeof healthResponseSchema>;
export type ReadinessResponseInput = z.infer<typeof readinessResponseSchema>;
export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type CreateOrganizationBody = z.infer<typeof createOrganizationBodySchema>;
export type CreateUserBody = z.infer<typeof createUserBodySchema>;
export type CreateTeamBody = z.infer<typeof createTeamBodySchema>;
export type CreateRoleBody = z.infer<typeof createRoleBodySchema>;
export type AssignRoleBody = z.infer<typeof assignRoleBodySchema>;
export type CreateApiKeyBody = z.infer<typeof createApiKeyBodySchema>;
export type CreateBucketBody = z.infer<typeof createBucketBodySchema>;
export type ListObjectsQuery = z.infer<typeof listObjectsQuerySchema>;
export type InitiateUploadBody = z.infer<typeof initiateUploadBodySchema>;
export type CompleteUploadBody = z.infer<typeof completeUploadBodySchema>;
export type ObjectDestinationBody = z.infer<typeof objectDestinationBodySchema>;
export type InitiateMultipartBody = z.infer<typeof initiateMultipartBodySchema>;
export type CompleteMultipartBody = z.infer<typeof completeMultipartBodySchema>;
export type SelectOrganizationBody = z.infer<typeof selectOrganizationBodySchema>;
