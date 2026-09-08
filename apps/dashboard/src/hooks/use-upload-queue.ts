import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiClientError,
  DEFAULT_MULTIPART_CONCURRENCY,
  type MultipartUploadController,
} from '@vaultstack/api-client';
import type { UploadItem } from '@vaultstack/ui';
import { apiClient } from '../lib/api.js';
import { buildObjectKey } from '../lib/storage-preferences.js';

export const MULTIPART_THRESHOLD_BYTES = 8 * 1024 * 1024;
export const MAX_CONCURRENT_FILES = 2;
const SESSION_STORAGE_KEY = 'vaultstack:multipart-sessions';

interface UploadRequest {
  id: string;
  file: File;
  bucketId: string;
  prefix: string;
}

interface PersistedMultipartSession {
  queueId: string;
  uploadId: string;
  bucketId: string;
  prefix: string;
  key: string;
  fileName: string;
  fileSize: number;
  lastModified: number;
  contentType: string;
}

function fileFingerprint(file: Pick<File, 'name' | 'size' | 'lastModified'>): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function readPersistedSessions(): PersistedMultipartSession[] {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedMultipartSession[]) : [];
  } catch {
    return [];
  }
}

function writePersistedSessions(sessions: PersistedMultipartSession[]): void {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessions));
}

export function useUploadQueue(options: { onComplete?: () => void } = {}) {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const abortControllers = useRef(new Map<string, AbortController>());
  const multipartControllers = useRef(new Map<string, MultipartUploadController>());
  const pendingRetries = useRef(new Map<string, UploadRequest>());
  const activeFiles = useRef(0);
  const waiting = useRef<UploadRequest[]>([]);

  const updateUpload = useCallback((id: string, patch: Partial<UploadItem>) => {
    setUploads((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  useEffect(() => {
    const persisted = readPersistedSessions();
    if (persisted.length === 0) {
      return;
    }

    setUploads((current) => {
      const existing = new Set(current.map((item) => item.id));
      const restored: UploadItem[] = persisted
        .filter((session) => !existing.has(session.queueId))
        .map((session) => ({
          id: session.queueId,
          fileName: session.fileName,
          size: session.fileSize,
          progress: 0,
          status: 'awaiting-file',
          error: 'Re-select the original file to resume this upload',
        }));
      return [...restored, ...current];
    });
  }, []);

  const persistSession = useCallback((request: UploadRequest, uploadId: string, key: string) => {
    const next = [
      {
        queueId: request.id,
        uploadId,
        bucketId: request.bucketId,
        prefix: request.prefix,
        key,
        fileName: request.file.name,
        fileSize: request.file.size,
        lastModified: request.file.lastModified,
        contentType: request.file.type || 'application/octet-stream',
      },
      ...readPersistedSessions().filter((session) => session.queueId !== request.id),
    ];
    writePersistedSessions(next);
  }, []);

  const forgetSession = useCallback((queueId: string) => {
    writePersistedSessions(readPersistedSessions().filter((session) => session.queueId !== queueId));
  }, []);

  const uploadFile = useCallback(
    async (request: UploadRequest) => {
      const uploadId = request.id;
      const abort = new AbortController();
      abortControllers.current.set(uploadId, abort);
      pendingRetries.current.set(uploadId, request);
      activeFiles.current += 1;

      updateUpload(uploadId, { status: 'uploading', progress: 0, error: undefined });

      try {
        const key = buildObjectKey(request.prefix, request.file.name);
        const useMultipart = request.file.size >= MULTIPART_THRESHOLD_BYTES;

        if (useMultipart) {
          const initiated = await apiClient.initiateMultipart({
            bucketId: request.bucketId,
            key,
            contentType: request.file.type || 'application/octet-stream',
            size: request.file.size,
          });
          persistSession(request, initiated.uploadId, key);

          const controllerHolder: { current?: MultipartUploadController } = {};
          const pending = apiClient.uploadMultipartFile(initiated.uploadId, request.file, {
            concurrency: DEFAULT_MULTIPART_CONCURRENCY,
            signal: abort.signal,
            controller: controllerHolder,
            onProgress: (event) => {
              updateUpload(uploadId, { progress: event.percent });
            },
          });
          if (controllerHolder.current) {
            multipartControllers.current.set(uploadId, controllerHolder.current);
          }
          await pending;
        } else {
          const initiated = await apiClient.initiateUpload({
            bucketId: request.bucketId,
            key,
            contentType: request.file.type || 'application/octet-stream',
            size: request.file.size,
          });

          await apiClient.uploadFileWithProgress(initiated, request.file, {
            signal: abort.signal,
            onProgress: (event) => {
              updateUpload(uploadId, { progress: event.percent });
            },
          });

          updateUpload(uploadId, { status: 'completing', progress: 100 });
          await apiClient.completeUpload(initiated.upload.id);
        }

        forgetSession(uploadId);
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
        multipartControllers.current.delete(uploadId);
        activeFiles.current = Math.max(0, activeFiles.current - 1);
        const next = waiting.current.shift();
        if (next) {
          void uploadFile(next);
        }
      }
    },
    [forgetSession, options.onComplete, persistSession, updateUpload],
  );

  const startOrQueue = useCallback(
    (request: UploadRequest) => {
      if (activeFiles.current >= MAX_CONCURRENT_FILES) {
        waiting.current.push(request);
        return;
      }
      void uploadFile(request);
    },
    [uploadFile],
  );

  const enqueueFiles = useCallback(
    (files: File[], bucketId: string, prefix: string) => {
      const persisted = readPersistedSessions();
      const nextUploads: UploadItem[] = [];

      files.forEach((file) => {
        const match = persisted.find(
          (session) =>
            session.bucketId === bucketId &&
            session.prefix === prefix &&
            fileFingerprint({
              name: session.fileName,
              size: session.fileSize,
              lastModified: session.lastModified,
            }) === fileFingerprint(file),
        );

        if (match) {
          const request: UploadRequest = { id: match.queueId, file, bucketId, prefix };
          pendingRetries.current.set(match.queueId, request);
          setUploads((current) =>
            current.map((item) =>
              item.id === match.queueId
                ? { ...item, status: 'pending', error: undefined, progress: 0 }
                : item,
            ),
          );
          startOrQueue(request);
          return;
        }

        const id = crypto.randomUUID();
        nextUploads.push({
          id,
          fileName: file.name,
          size: file.size,
          progress: 0,
          status: 'pending',
        });
        startOrQueue({ id, file, bucketId, prefix });
      });

      if (nextUploads.length > 0) {
        setUploads((current) => [...nextUploads, ...current]);
      }
    },
    [startOrQueue],
  );

  const cancelUpload = useCallback(
    (uploadId: string) => {
      multipartControllers.current.get(uploadId)?.cancel();
      abortControllers.current.get(uploadId)?.abort();
      const persisted = readPersistedSessions().find((session) => session.queueId === uploadId);
      if (persisted) {
        void apiClient.abortMultipart(persisted.uploadId).catch(() => undefined);
      }
      forgetSession(uploadId);
      updateUpload(uploadId, { status: 'cancelled' });
    },
    [forgetSession, updateUpload],
  );

  const pauseUpload = useCallback(
    (uploadId: string) => {
      multipartControllers.current.get(uploadId)?.pause();
      updateUpload(uploadId, { status: 'paused' });
    },
    [updateUpload],
  );

  const resumeUpload = useCallback(
    (uploadId: string) => {
      const controller = multipartControllers.current.get(uploadId);
      if (controller) {
        controller.resume();
        updateUpload(uploadId, { status: 'uploading', error: undefined });
        return;
      }

      const request = pendingRetries.current.get(uploadId);
      if (request) {
        startOrQueue(request);
      }
    },
    [startOrQueue, updateUpload],
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
    pauseUpload,
    resumeUpload,
  };
}
