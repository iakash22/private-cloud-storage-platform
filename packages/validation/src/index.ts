import { healthResponseSchema, readinessResponseSchema } from './common.schemas.js';
import type { z } from 'zod';

export * from './common.schemas.js';
export * from './auth.schemas.js';
export * from './organization.schemas.js';
export * from './storage.schemas.js';
export * from './s3-credentials.schemas.js';

export type HealthResponseInput = z.infer<typeof healthResponseSchema>;
export type ReadinessResponseInput = z.infer<typeof readinessResponseSchema>;
