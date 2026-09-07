import { z } from 'zod';

export const bucketNameSchema = z.string().trim().min(3).max(63);
export const objectKeySchema = z.string().min(1).max(1024);
export const sha256ChecksumSchema = z
  .string()
  .regex(/^[a-fA-F0-9]{64}$/, 'Checksum must be a hex-encoded SHA-256 digest');
export const multipartPartNumberSchema = z.coerce.number().int().min(1).max(10_000);
export const multipartSessionStatusSchema = z.enum([
  'INITIATED',
  'UPLOADING',
  'COMPLETING',
  'COMPLETED',
  'ABORTED',
  'EXPIRED',
]);

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

export const multipartPartParamsSchema = z
  .object({
    uploadId: z.string().min(1),
    partNumber: multipartPartNumberSchema,
  })
  .strict();

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
  checksumSha256: sha256ChecksumSchema.optional(),
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
  size: z.coerce.number().int().nonnegative(),
});

export const multipartPartQuerySchema = z
  .object({
    partNumber: multipartPartNumberSchema,
  })
  .strict();

/** Backwards-compatible name used by the existing multipart upload route. */
export const uploadPartQuerySchema = multipartPartQuerySchema;

export const multipartPartDestinationBodySchema = z
  .object({
    checksumSha256: sha256ChecksumSchema.optional(),
  })
  .strict();

export const confirmMultipartPartBodySchema = z
  .object({
    etag: z.string().min(1).max(256),
    size: z.coerce.number().int().nonnegative(),
    checksumSha256: sha256ChecksumSchema.optional(),
  })
  .strict();

export const completeMultipartBodySchema = z
  .object({
    parts: z
      .array(
        z
          .object({
            partNumber: multipartPartNumberSchema,
            etag: z.string().min(1).max(256),
            checksumSha256: sha256ChecksumSchema.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(10_000),
  })
  .strict();

export const listMultipartSessionsQuerySchema = z
  .object({
    status: multipartSessionStatusSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().min(1).max(1024).optional(),
  })
  .strict();

export const multipartSessionStatusParamsSchema = z
  .object({
    uploadId: z.string().min(1),
  })
  .strict();

export type CreateBucketBody = z.infer<typeof createBucketBodySchema>;
export type ListObjectsQuery = z.infer<typeof listObjectsQuerySchema>;
export type InitiateUploadBody = z.infer<typeof initiateUploadBodySchema>;
export type CompleteUploadBody = z.infer<typeof completeUploadBodySchema>;
export type ObjectDestinationBody = z.infer<typeof objectDestinationBodySchema>;
export type InitiateMultipartBody = z.infer<typeof initiateMultipartBodySchema>;
export type MultipartPartParams = z.infer<typeof multipartPartParamsSchema>;
export type MultipartPartQuery = z.infer<typeof multipartPartQuerySchema>;
export type MultipartPartDestinationBody = z.infer<typeof multipartPartDestinationBodySchema>;
export type ConfirmMultipartPartBody = z.infer<typeof confirmMultipartPartBodySchema>;
export type CompleteMultipartBody = z.infer<typeof completeMultipartBodySchema>;
export type MultipartSessionStatus = z.infer<typeof multipartSessionStatusSchema>;
export type MultipartSessionStatusParams = z.infer<typeof multipartSessionStatusParamsSchema>;
export type ListMultipartSessionsQuery = z.infer<typeof listMultipartSessionsQuerySchema>;
