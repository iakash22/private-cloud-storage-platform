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

export type HealthResponseInput = z.infer<typeof healthResponseSchema>;
export type ReadinessResponseInput = z.infer<typeof readinessResponseSchema>;
