import { z } from 'zod';

const s3CredentialPermissionSchema = z.enum([
  'storage.read',
  'storage.upload',
  'storage.delete',
  'storage.share',
  'artifact.read',
  'artifact.upload',
  'artifact.delete',
  'backup.read',
  'backup.create',
  'backup.restore',
  'backup.delete',
]);

export const createS3CredentialBodySchema = z.object({
  serviceAccountName: z.string().trim().min(2).max(64),
  description: z.string().trim().max(256).optional(),
  permissions: z.array(s3CredentialPermissionSchema).min(1),
  allowedBucketNames: z.array(z.string().trim().min(3).max(63)).default([]),
  expiresAt: z.string().datetime().optional(),
});

export const updateS3CredentialBodySchema = z.object({
  permissions: z.array(s3CredentialPermissionSchema).min(1).optional(),
  allowedBucketNames: z.array(z.string().trim().min(3).max(63)).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

export const s3CredentialIdParamsSchema = z.object({
  organizationId: z.string().min(1),
  credentialId: z.string().min(1),
});

export const serviceAccountIdParamsSchema = z.object({
  organizationId: z.string().min(1),
  serviceAccountId: z.string().min(1),
});

export const updateServiceAccountBodySchema = z.object({
  description: z.string().trim().max(256).nullable().optional(),
  disabled: z.boolean().optional(),
});

export type CreateS3CredentialBody = z.infer<typeof createS3CredentialBodySchema>;
export type UpdateS3CredentialBody = z.infer<typeof updateS3CredentialBodySchema>;
export type UpdateServiceAccountBody = z.infer<typeof updateServiceAccountBodySchema>;
