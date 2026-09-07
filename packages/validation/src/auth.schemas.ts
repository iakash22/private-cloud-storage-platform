import { z } from 'zod';
import { emailSchema, nameSchema, organizationNameSchema, passwordSchema } from './common.schemas.js';

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

export const selectOrganizationBodySchema = z.object({
  organizationId: z.string().min(1),
});

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type SelectOrganizationBody = z.infer<typeof selectOrganizationBodySchema>;
