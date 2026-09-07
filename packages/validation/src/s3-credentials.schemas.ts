import { z } from 'zod';

const s3CredentialPermissionSchema = z.enum([
  'storage.read',
  'storage.upload',
  'storage.delete',
]);

export const createS3CredentialBodySchema = z.object({
  serviceAccountName: z.string().trim().min(2).max(64),
  description: z.string().trim().max(256).optional(),
  permissions: z.array(s3CredentialPermissionSchema).min(1),
  allowedBucketNames: z.array(z.string().trim().min(3).max(63)).default([]),
  expiresAt: z.string().datetime().optional(),
});

export const s3CredentialIdParamsSchema = z.object({
  organizationId: z.string().min(1),
  credentialId: z.string().min(1),
});

export type CreateS3CredentialBody = z.infer<typeof createS3CredentialBodySchema>;
