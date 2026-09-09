import { z } from 'zod';
import {
  emailSchema,
  nameSchema,
  organizationNameSchema,
  passwordSchema,
} from './common.schemas.js';

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

export const addTeamMemberBodySchema = z
  .object({
    userId: z.string().min(1),
  })
  .strict();

export const organizationTeamMemberParamsSchema = z.object({
  organizationId: z.string().min(1),
  teamId: z.string().min(1),
  userId: z.string().min(1),
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

export const auditLogQuerySchema = z
  .object({
    userId: z.string().min(1).optional(),
    action: z.string().trim().min(1).max(120).optional(),
    resourceType: z.string().trim().min(1).max(80).optional(),
    dateFrom: z.string().date().optional(),
    dateTo: z.string().date().optional(),
    result: z.enum(['success', 'failure']).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

export type CreateOrganizationBody = z.infer<typeof createOrganizationBodySchema>;
export type CreateUserBody = z.infer<typeof createUserBodySchema>;
export type CreateTeamBody = z.infer<typeof createTeamBodySchema>;
export type AddTeamMemberBody = z.infer<typeof addTeamMemberBodySchema>;
export type CreateRoleBody = z.infer<typeof createRoleBodySchema>;
export type AssignRoleBody = z.infer<typeof assignRoleBodySchema>;
export type CreateApiKeyBody = z.infer<typeof createApiKeyBodySchema>;
