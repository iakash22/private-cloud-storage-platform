import { useCallback, useRef, useState } from 'react';
import { ApiClientError } from '@vaultstack/api-client';
import type { UploadItem } from '@vaultstack/ui';
import { apiClient } from '../lib/api.js';
import { buildObjectKey } from '../lib/storage-preferences.js';

interface UploadRequest {
  id: string;
  file: File;
  bucketId: string;
  prefix: string;
}

export function useUploadQueue(options: { onComplete?: () => void } = {}) {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const abortControllers = useRef(new Map<string, AbortController>());
  const pendingRetries = useRef(new Map<string, UploadRequest>());

  const updateUpload = useCallback((id: string, patch: Partial<UploadItem>) => {
    setUploads((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const uploadFile = useCallback(
    async (request: UploadRequest) => {
      const uploadId = request.id;
      abortControllers.current.set(uploadId, new AbortController());
      pendingRetries.current.set(uploadId, request);

      updateUpload(uploadId, { status: 'uploading', progress: 0, error: undefined });

      try {
        const initiated = await apiClient.initiateUpload({
          bucketId: request.bucketId,
          key: buildObjectKey(request.prefix, request.file.name),
          contentType: request.file.type || 'application/octet-stream',
          size: request.file.size,
        });

        await apiClient.uploadFileWithProgress(initiated, request.file, {
          signal: abortControllers.current.get(uploadId)?.signal,
          onProgress: (event) => {
            updateUpload(uploadId, { progress: event.percent });
          },
        });

        updateUpload(uploadId, { status: 'completing', progress: 100 });
        await apiClient.completeUpload(initiated.upload.id);
        updateUpload(uploadId, { status: 'completed', progress: 100 });
        options.onComplete?.();
      } catch (caught) {
        const message =
          caught instanceof ApiClientError
            ? caught.message
            : caught instanceof Error
              ? caught.message
              : 'Upload failed';

        updateUpload(uploadId, {
          status: message.includes('cancelled') ? 'cancelled' : 'failed',
          error: message,
        });
      } finally {
        abortControllers.current.delete(uploadId);
      }
    },
    [updateUpload, options.onComplete],
  );

  const enqueueFiles = useCallback(
    (files: File[], bucketId: string, prefix: string) => {
      const nextUploads: UploadItem[] = files.map((file) => ({
        id: crypto.randomUUID(),
        fileName: file.name,
        size: file.size,
        progress: 0,
        status: 'pending',
      }));

      setUploads((current) => [...nextUploads, ...current]);

      nextUploads.forEach((item, index) => {
        const file = files[index];
        if (!file) {
          return;
        }

        void uploadFile({ id: item.id, file, bucketId, prefix });
      });
    },
    [uploadFile],
  );

  const cancelUpload = useCallback(
    (uploadId: string) => {
      abortControllers.current.get(uploadId)?.abort();
      updateUpload(uploadId, { status: 'cancelled' });
    },
    [updateUpload],
  );

  const retryUpload = useCallback(
    (uploadId: string) => {
      const request = pendingRetries.current.get(uploadId);
      if (!request) {
        return;
      }

      void uploadFile(request);
    },
    [uploadFile],
  );

  return {
    uploads,
    enqueueFiles,
    cancelUpload,
    retryUpload,
  };
}
