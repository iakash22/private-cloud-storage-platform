import { z } from 'zod';

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

export type CreateBucketBody = z.infer<typeof createBucketBodySchema>;
export type ListObjectsQuery = z.infer<typeof listObjectsQuerySchema>;
export type InitiateUploadBody = z.infer<typeof initiateUploadBodySchema>;
export type CompleteUploadBody = z.infer<typeof completeUploadBodySchema>;
export type ObjectDestinationBody = z.infer<typeof objectDestinationBodySchema>;
export type InitiateMultipartBody = z.infer<typeof initiateMultipartBodySchema>;
export type CompleteMultipartBody = z.infer<typeof completeMultipartBodySchema>;
