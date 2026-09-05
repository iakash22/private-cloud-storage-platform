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
export const passwordSchema = z.string().min(8).max(128);
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
