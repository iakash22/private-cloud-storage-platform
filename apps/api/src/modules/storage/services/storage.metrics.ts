import type { Logger } from '@vaultstack/logger';

/**
 * Observability hooks for storage operations.
 *
 * Phase 3 emits structured log events and keeps in-process counters only. A
 * real metrics backend belongs to the later observability phase, so nothing
 * here depends on Prometheus.
 *
 * Never pass credentials, presigned URLs, or physical paths into these calls.
 */
export interface StorageMetricsSnapshot {
  uploads: number;
  downloads: number;
  bytesUploaded: number;
  bytesDownloaded: number;
  failedUploads: number;
  activeUploads: number;
  multipartUploads: number;
  providerErrors: number;
}

export interface StorageMetrics {
  uploadStarted(): void;
  uploadCompleted(input: {
    organizationId: string;
    bucketId: string;
    bytes: number;
    durationMs: number;
  }): void;
  uploadFailed(input: { organizationId: string; bucketId: string; reason: string }): void;
  downloadCompleted(input: {
    organizationId: string;
    bucketId: string;
    bytes: number;
    durationMs: number;
  }): void;
  multipartCompleted(input: { organizationId: string; bucketId: string; parts: number }): void;
  providerError(input: { providerType: string; operation: string }): void;
  snapshot(): StorageMetricsSnapshot;
}

export function createStorageMetrics(logger: Logger): StorageMetrics {
  const counters: StorageMetricsSnapshot = {
    uploads: 0,
    downloads: 0,
    bytesUploaded: 0,
    bytesDownloaded: 0,
    failedUploads: 0,
    activeUploads: 0,
    multipartUploads: 0,
    providerErrors: 0,
  };

  return {
    uploadStarted() {
      counters.activeUploads += 1;
    },

    uploadCompleted(input) {
      counters.activeUploads = Math.max(0, counters.activeUploads - 1);
      counters.uploads += 1;
      counters.bytesUploaded += input.bytes;

      logger.info(
        {
          event: 'storage.object.uploaded',
          organizationId: input.organizationId,
          bucketId: input.bucketId,
          bytes: input.bytes,
          durationMs: input.durationMs,
        },
        'Object uploaded',
      );
    },

    uploadFailed(input) {
      counters.activeUploads = Math.max(0, counters.activeUploads - 1);
      counters.failedUploads += 1;

      logger.warn(
        {
          event: 'storage.object.upload_failed',
          organizationId: input.organizationId,
          bucketId: input.bucketId,
          reason: input.reason,
        },
        'Object upload failed',
      );
    },

    downloadCompleted(input) {
      counters.downloads += 1;
      counters.bytesDownloaded += input.bytes;

      logger.info(
        {
          event: 'storage.object.downloaded',
          organizationId: input.organizationId,
          bucketId: input.bucketId,
          bytes: input.bytes,
          durationMs: input.durationMs,
        },
        'Object downloaded',
      );
    },

    multipartCompleted(input) {
      counters.multipartUploads += 1;

      logger.info(
        {
          event: 'storage.multipart.completed',
          organizationId: input.organizationId,
          bucketId: input.bucketId,
          parts: input.parts,
        },
        'Multipart upload completed',
      );
    },

    providerError(input) {
      counters.providerErrors += 1;

      logger.error(
        {
          event: 'storage.provider.error',
          providerType: input.providerType,
          operation: input.operation,
        },
        'Storage provider error',
      );
    },

    snapshot() {
      return { ...counters };
    },
  };
}
