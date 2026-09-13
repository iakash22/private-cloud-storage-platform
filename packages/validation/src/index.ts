import { healthResponseSchema, readinessResponseSchema } from './common.schemas.js';
import type { z } from 'zod';

export * from './common.schemas.js';
export * from './form-errors.js';
export * from './auth.schemas.js';
export * from './organization.schemas.js';
export * from './storage.schemas.js';
export * from './s3-credentials.schemas.js';
export * from './artifact.schemas.js';
export * from './backup.schemas.js';
export * from './infrastructure.schemas.js';
export * from './realtime.schemas.js';

export type HealthResponseInput = z.infer<typeof healthResponseSchema>;
export type ReadinessResponseInput = z.infer<typeof readinessResponseSchema>;
