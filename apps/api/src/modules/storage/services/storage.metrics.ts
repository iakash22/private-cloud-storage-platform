import type { Logger } from '@vaultstack/logger';
import type { MetricsRecorder } from '../../../observability/metrics.js';

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
  multipartParts: number;
  multipartCleanups: number;
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
  partUploaded(input: {
    organizationId: string;
    bucketId: string;
    partNumber: number;
    bytes: number;
  }): void;
  multipartCleanup(input: { uploads: number; multipart: number }): void;
  providerError(input: { providerType: string; operation: string }): void;
  integrityFailure(): void;
  snapshot(): StorageMetricsSnapshot;
}

export function createStorageMetrics(logger: Logger, recorder?: MetricsRecorder): StorageMetrics {
  const counters: StorageMetricsSnapshot = {
    uploads: 0,
    downloads: 0,
    bytesUploaded: 0,
    bytesDownloaded: 0,
    failedUploads: 0,
    activeUploads: 0,
    multipartUploads: 0,
    multipartParts: 0,
    multipartCleanups: 0,
    providerErrors: 0,
  };

  return {
    uploadStarted() {
      counters.activeUploads += 1;
      recorder?.set('vaultstack_storage_active_uploads', counters.activeUploads);
    },

    uploadCompleted(input) {
      counters.activeUploads = Math.max(0, counters.activeUploads - 1);
      counters.uploads += 1;
      counters.bytesUploaded += input.bytes;
      recorder?.increment('vaultstack_storage_uploads_total');
      recorder?.increment('vaultstack_storage_bytes_uploaded_total', {}, input.bytes);
      recorder?.set('vaultstack_storage_active_uploads', counters.activeUploads);

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
      recorder?.increment('vaultstack_storage_failed_uploads_total');
      recorder?.set('vaultstack_storage_active_uploads', counters.activeUploads);

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
      recorder?.increment('vaultstack_storage_downloads_total');
      recorder?.increment('vaultstack_storage_bytes_downloaded_total', {}, input.bytes);

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
      recorder?.increment('vaultstack_storage_multipart_uploads_total');

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

    partUploaded(input) {
      counters.multipartParts += 1;
      counters.bytesUploaded += input.bytes;
      recorder?.increment('vaultstack_storage_multipart_parts_total');
      recorder?.increment('vaultstack_storage_bytes_uploaded_total', {}, input.bytes);

      logger.info(
        {
          event: 'storage.multipart.part_uploaded',
          organizationId: input.organizationId,
          bucketId: input.bucketId,
          partNumber: input.partNumber,
          bytes: input.bytes,
        },
        'Multipart part uploaded',
      );
    },

    multipartCleanup(input) {
      counters.multipartCleanups += 1;
      recorder?.increment('vaultstack_storage_multipart_cleanups_total');

      logger.info(
        {
          event: 'storage.multipart.cleanup',
          uploads: input.uploads,
          multipart: input.multipart,
        },
        'Expired storage sessions cleaned up',
      );
    },

    providerError(input) {
      counters.providerErrors += 1;
      recorder?.increment('vaultstack_storage_provider_errors_total');

      logger.error(
        {
          event: 'storage.provider.error',
          providerType: input.providerType,
          operation: input.operation,
        },
        'Storage provider error',
      );
    },

    integrityFailure() {
      recorder?.increment('vaultstack_storage_corruption_indicators_total');
    },

    snapshot() {
      return { ...counters };
    },
  };
}
