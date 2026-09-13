import { z } from 'zod';

export const realtimeEventTypeSchema = z.enum([
  'ping',
  'session.revoked',
  'session.revoked_all',
  'folder_operation.progress',
  'folder_operation.completed',
  'folder_operation.failed',
  'backup_job.progress',
  'backup_job.completed',
  'backup_job.failed',
]);

export const realtimeEventSchema = z.object({
  id: z.string().uuid(),
  type: realtimeEventTypeSchema,
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  createdAt: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});

export type RealtimeEventInput = z.infer<typeof realtimeEventSchema>;
