import { createRequire } from 'node:module';
import type { ConnectionOptions, Job } from 'bullmq';

/**
 * BullMQ 5.x ships ESM that Node cannot load (directory imports, no `exports`).
 * Load the CJS build so `tsx` API/worker processes can start.
 */
const require = createRequire(import.meta.url);
const bullmq = require('bullmq') as typeof import('bullmq');

export const Queue = bullmq.Queue;
export const Worker = bullmq.Worker;
export type QueueInstance = InstanceType<typeof Queue>;
export type { ConnectionOptions, Job };
