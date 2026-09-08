import { z } from 'zod';

export const infrastructureCollectorStatusSchema = z.enum(['ok', 'degraded', 'unavailable']);
