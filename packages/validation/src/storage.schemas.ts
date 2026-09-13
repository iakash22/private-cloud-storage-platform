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
  storageProviderId: z.string().min(1).optional(),
});

export const createFolderBodySchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    parentPrefix: z.string().max(1024).optional().default(''),
  })
  .strict();

export type CreateFolderBody = z.infer<typeof createFolderBodySchema>;

export const createFolderOperationBodySchema = z
  .object({
    bucketId: z.string().min(1),
    operation: z.enum(['MOVE', 'COPY', 'DELETE']),
    sourcePrefix: z.string().min(1).max(1024),
    destinationPrefix: z.string().max(1024).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.operation !== 'DELETE' && !value.destinationPrefix) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['destinationPrefix'],
        message: 'Destination prefix is required for move and copy operations',
      });
    }
  });

export const folderOperationJobIdParamsSchema = z.object({
  jobId: z.string().min(1),
});

export const S3_DIALECT_VALUES = [
  'AWS_S3',
  'CLOUDFLARE_R2',
  'BACKBLAZE_B2',
  'MINIO',
  'WASABI',
  'DIGITALOCEAN_SPACES',
  'GENERIC',
] as const;

export const s3DialectSchema = z.enum(S3_DIALECT_VALUES);

export const storageProviderStatusSchema = z.enum(['ACTIVE', 'DEGRADED', 'DISABLED']);

export const storageProviderIdParamsSchema = z
  .object({
    providerId: z.string().min(1),
  })
  .strict();

const providerEndpointSchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .refine((value) => !/\s/.test(value), 'Endpoint must not contain whitespace');

const providerSecretSchema = z.string().min(1).max(512);

export const createStorageProviderBodySchema = z
  .object({
    name: z.string().trim().min(1).max(64),
    dialect: s3DialectSchema,
    endpoint: providerEndpointSchema.optional(),
    region: z.string().trim().min(1).max(64).optional(),
    bucket: bucketNameSchema.optional(),
    forcePathStyle: z.boolean().optional(),
    tls: z.boolean().optional(),
    accountId: z.string().trim().min(1).max(128).optional(),
    accessKeyId: z.string().trim().min(1).max(128),
    secretAccessKey: providerSecretSchema,
    isDefault: z.boolean().optional(),
    status: storageProviderStatusSchema.optional(),
  })
  .strict();

export const updateStorageProviderBodySchema = z
  .object({
    name: z.string().trim().min(1).max(64).optional(),
    dialect: s3DialectSchema.optional(),
    endpoint: providerEndpointSchema.nullable().optional(),
    region: z.string().trim().min(1).max(64).nullable().optional(),
    bucket: bucketNameSchema.nullable().optional(),
    forcePathStyle: z.boolean().nullable().optional(),
    tls: z.boolean().nullable().optional(),
    accountId: z.string().trim().min(1).max(128).nullable().optional(),
    accessKeyId: z.string().trim().min(1).max(128).optional(),
    secretAccessKey: providerSecretSchema.optional(),
    isDefault: z.boolean().optional(),
    status: storageProviderStatusSchema.optional(),
  })
  .strict();

export type CreateStorageProviderBody = z.infer<typeof createStorageProviderBodySchema>;
export type UpdateStorageProviderBody = z.infer<typeof updateStorageProviderBodySchema>;

export const updateBucketVersioningBodySchema = z
  .object({
    versioning: z.enum(['UNVERSIONED', 'ENABLED', 'SUSPENDED']),
  })
  .strict();

export const objectVersionParamsSchema = z
  .object({
    objectId: z.string().min(1),
    versionId: z.string().min(1).max(128),
  })
  .strict();

export const deleteObjectQuerySchema = z
  .object({
    versionId: z.string().min(1).max(128).optional(),
  })
  .strict();

export const downloadUrlBodySchema = z.preprocess(
  (value) => value ?? {},
  z
    .object({
      versionId: z.string().min(1).max(128).optional(),
    })
    .strict(),
);

export const storagePolicyIdParamsSchema = z
  .object({
    policyId: z.string().min(1),
  })
  .strict();

export const createLifecyclePolicyBodySchema = z
  .object({
    name: z.string().trim().min(1).max(128),
    bucketId: z.string().min(1).optional(),
    keyPrefix: z.string().min(1).max(1024).optional(),
    days: z.coerce.number().int().min(1).max(3650),
    lifecycleAction: z.enum([
      'EXPIRE_CURRENT',
      'EXPIRE_NONCURRENT',
      'ABORT_INCOMPLETE_MULTIPART',
      'EXPIRE_TEMPORARY',
    ]),
    enabled: z.boolean().optional(),
  })
  .strict();

export const updateLifecyclePolicyBodySchema = z
  .object({
    name: z.string().trim().min(1).max(128).optional(),
    keyPrefix: z.string().min(1).max(1024).nullable().optional(),
    days: z.coerce.number().int().min(1).max(3650).optional(),
    lifecycleAction: z
      .enum([
        'EXPIRE_CURRENT',
        'EXPIRE_NONCURRENT',
        'ABORT_INCOMPLETE_MULTIPART',
        'EXPIRE_TEMPORARY',
      ])
      .optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

export const bucketIdParamsSchema = z.object({
  bucketId: z.string().min(1),
});

export const objectIdParamsSchema = z.object({
  objectId: z.string().min(1),
});

export const previewJobIdParamsSchema = z.object({
  jobId: z.string().min(1),
});

export const createPreviewBodySchema = z
  .object({
    kind: z.enum(['ARCHIVE', 'OFFICE']),
  })
  .strict();

export const uploadIdParamsSchema = z.object({
  uploadId: z.string().min(1),
});

export const multipartPartParamsSchema = z
  .object({
    uploadId: z.string().min(1),
    partNumber: multipartPartNumberSchema,
  })
  .strict();

const queryBooleanSchema = z.preprocess(
  (value) => (value === 'true' ? true : value === 'false' ? false : value),
  z.boolean(),
);

export const listObjectsQuerySchema = z.object({
  prefix: z.string().max(1024).optional(),
  search: z.string().trim().max(255).optional(),
  delimiter: z.string().max(8).optional(),
  contentType: z.string().trim().max(255).optional(),
  minSize: z.coerce.number().int().nonnegative().optional(),
  maxSize: z.coerce.number().int().nonnegative().optional(),
  modifiedFrom: z.string().datetime().optional(),
  modifiedTo: z.string().datetime().optional(),
  folderPrefix: z.string().max(1024).optional(),
  tag: z.string().trim().max(64).optional(),
  externallyShared: queryBooleanSchema.optional(),
  versioned: queryBooleanSchema.optional(),
  processingState: z.string().trim().max(32).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  cursor: z.string().max(1024).optional(),
}).strict().superRefine((value, context) => {
  if (value.minSize !== undefined && value.maxSize !== undefined && value.minSize > value.maxSize) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['maxSize'],
      message: 'maxSize must be greater than or equal to minSize',
    });
  }
  if (
    value.modifiedFrom !== undefined &&
    value.modifiedTo !== undefined &&
    new Date(value.modifiedFrom) > new Date(value.modifiedTo)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['modifiedTo'],
      message: 'modifiedTo must be greater than or equal to modifiedFrom',
    });
  }
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

export const updateObjectMetadataBodySchema = z
  .object({
    description: z.string().trim().max(2000).nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(64)).max(32).optional(),
  })
  .strict();

export const folderAccessRuleBodySchema = z
  .object({
    bucketId: z.string().min(1),
    prefix: z.string().trim().min(1).max(1024),
    role: z.enum(['VIEWER', 'EDITOR', 'MANAGER']),
    userId: z.string().min(1).optional(),
    teamId: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (Boolean(value.userId) === Boolean(value.teamId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Exactly one of userId or teamId is required',
        path: ['userId'],
      });
    }
  });

export const folderAccessRuleParamsSchema = z.object({
  ruleId: z.string().min(1),
});

export const listFolderAccessQuerySchema = z
  .object({
    prefix: z.string().max(1024).optional(),
  })
  .strict();

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
    size: z.coerce.number().int().positive().optional(),
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
export type UpdateBucketVersioningBody = z.infer<typeof updateBucketVersioningBodySchema>;
export type ObjectVersionParams = z.infer<typeof objectVersionParamsSchema>;
export type DeleteObjectQuery = z.infer<typeof deleteObjectQuerySchema>;
export type DownloadUrlBody = z.infer<typeof downloadUrlBodySchema>;
export type CreateLifecyclePolicyBody = z.infer<typeof createLifecyclePolicyBodySchema>;
export type UpdateLifecyclePolicyBody = z.infer<typeof updateLifecyclePolicyBodySchema>;

export const SHARE_VISIBILITY_VALUES = ['PRIVATE', 'TEAM', 'ORGANIZATION', 'PUBLIC_LINK'] as const;

export const shareVisibilitySchema = z.enum(SHARE_VISIBILITY_VALUES);

export const sharePasswordSchema = z.string().min(8).max(128);

export const shareIdParamsSchema = z
  .object({
    shareId: z.string().min(1),
  })
  .strict();

export const shareTokenParamsSchema = z
  .object({
    token: z.string().min(1).max(200),
  })
  .strict();

export const createShareBodySchema = z
  .object({
    visibility: shareVisibilitySchema,
    teamId: z.string().min(1).optional(),
    password: sharePasswordSchema.optional(),
    allowView: z.boolean().optional(),
    allowDownload: z.boolean().optional(),
    maxDownloads: z.number().int().min(1).max(1_000_000).optional(),
    expiresAt: z.string().datetime().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.visibility === 'TEAM' && !value.teamId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'teamId is required for TEAM shares',
        path: ['teamId'],
      });
    }
    if (value.visibility !== 'TEAM' && value.teamId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'teamId is only valid for TEAM shares',
        path: ['teamId'],
      });
    }
    if (value.allowView === false && value.allowDownload === false) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A share must allow viewing or downloading',
        path: ['allowView'],
      });
    }
  });

export const updateShareBodySchema = z
  .object({
    expiresAt: z.string().datetime().nullable().optional(),
    allowView: z.boolean().optional(),
    allowDownload: z.boolean().optional(),
    maxDownloads: z.number().int().min(1).max(1_000_000).nullable().optional(),
    revoked: z.literal(true).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.allowView === false && value.allowDownload === false) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A share must allow viewing or downloading',
        path: ['allowView'],
      });
    }
  });

export const listSharesQuerySchema = z
  .object({
    objectId: z.string().min(1).optional(),
  })
  .strict();

export const unlockShareBodySchema = z
  .object({
    password: z.string().min(1).max(128),
  })
  .strict();

export const shareDownloadBodySchema = z.preprocess(
  (value) => value ?? {},
  z
    .object({
      password: z.string().min(1).max(128).optional(),
      accessToken: z.string().min(1).max(4096).optional(),
    })
    .strict(),
);

export const inspectShareQuerySchema = z
  .object({
    accessToken: z.string().min(1).max(4096).optional(),
  })
  .strict();

export type CreateShareBody = z.infer<typeof createShareBodySchema>;
export type UpdateShareBody = z.infer<typeof updateShareBodySchema>;
export type ListSharesQuery = z.infer<typeof listSharesQuerySchema>;
export type UnlockShareBody = z.infer<typeof unlockShareBodySchema>;
export type ShareDownloadBody = z.infer<typeof shareDownloadBodySchema>;
