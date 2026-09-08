import { Queue, Worker, type ConnectionOptions, type QueueInstance } from '../lib/bullmq.js';
import type { Logger } from '@vaultstack/logger';
import type { ArtifactsService } from '../modules/artifacts/services/artifacts.service.js';

export const ARTIFACT_RETENTION_QUEUE = 'artifact-retention';
export const ARTIFACT_RETENTION_JOB = 'apply-artifact-retention';
export const ARTIFACT_RETENTION_INTERVAL_MS = 60_000;

export function createArtifactRetentionQueue(connection: ConnectionOptions): QueueInstance {
  return new Queue(ARTIFACT_RETENTION_QUEUE, { connection });
}

export async function scheduleArtifactRetention(queue: QueueInstance): Promise<void> {
  await queue.add(
    ARTIFACT_RETENTION_JOB,
    {},
    {
      repeat: { every: ARTIFACT_RETENTION_INTERVAL_MS },
      removeOnComplete: 20,
      removeOnFail: 50,
    },
  );
}

export async function runArtifactRetention(
  artifacts: ArtifactsService,
): Promise<{ expired: number }> {
  return artifacts.applyRetention();
}

export function createArtifactRetentionWorker(deps: {
  connection: ConnectionOptions;
  artifacts: ArtifactsService;
  logger: Logger;
}) {
  const { connection, artifacts, logger } = deps;

  return new Worker(
    ARTIFACT_RETENTION_QUEUE,
    async () => {
      const result = await runArtifactRetention(artifacts);
      logger.info(
        { event: 'artifact.retention.job', ...result },
        'Artifact retention job finished',
      );
      return result;
    },
    { connection, concurrency: 1 },
  );
}
