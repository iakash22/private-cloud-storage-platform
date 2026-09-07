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
