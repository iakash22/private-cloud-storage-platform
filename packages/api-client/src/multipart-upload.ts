import type {
  MultipartPartTransferDescriptor,
  PublicMultipartPart,
  PublicStorageObject,
} from '@vaultstack/types';
import { ApiClientError } from './errors.js';
import { uploadBlobWithProgress, type UploadWithProgressOptions } from './upload-with-progress.js';

export const DEFAULT_MULTIPART_PART_SIZE_BYTES = 8 * 1024 * 1024;
export const DEFAULT_MULTIPART_CONCURRENCY = 4;
export const DEFAULT_MULTIPART_MAX_RETRIES = 4;

export interface MultipartUploadProgressEvent {
  loaded: number;
  total: number;
  percent: number;
  completedParts: number;
  totalParts: number;
}

export interface MultipartUploadController {
  pause(): void;
  resume(): void;
  cancel(): void;
  readonly paused: boolean;
}

export interface UploadMultipartFileOptions {
  partSizeBytes?: number;
  concurrency?: number;
  maxRetries?: number;
  signal?: AbortSignal;
  onProgress?: (event: MultipartUploadProgressEvent) => void;
  controller?: { current?: MultipartUploadController };
}

export interface MultipartUploadApi {
  createPartDestination(
    uploadId: string,
    partNumber: number,
    input?: { size?: number; checksumSha256?: string },
  ): Promise<MultipartPartTransferDescriptor>;
  confirmPart(
    uploadId: string,
    partNumber: number,
    input: { etag: string; size: number; checksumSha256?: string },
  ): Promise<PublicMultipartPart>;
  completeMultipart(
    uploadId: string,
    parts: { partNumber: number; etag: string; checksumSha256?: string }[],
  ): Promise<PublicStorageObject>;
}

export async function uploadMultipartFile(
  api: MultipartUploadApi,
  uploadId: string,
  file: File | Blob,
  options: UploadMultipartFileOptions = {},
): Promise<PublicStorageObject> {
  const partSize = options.partSizeBytes ?? DEFAULT_MULTIPART_PART_SIZE_BYTES;
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_MULTIPART_CONCURRENCY);
  const maxRetries = options.maxRetries ?? DEFAULT_MULTIPART_MAX_RETRIES;
  const total = file.size;
  const totalParts = Math.max(1, Math.ceil(total / partSize));
  const partProgress = new Map<number, number>();
  let paused = false;
  const waiters: (() => void)[] = [];
  const abort = new AbortController();

  const isAborted = (): boolean => abort.signal.aborted;

  const linkedSignal = options.signal;
  if (linkedSignal?.aborted) {
    abort.abort();
  } else {
    linkedSignal?.addEventListener(
      'abort',
      () => {
        abort.abort();
      },
      { once: true },
    );
  }

  const controller: MultipartUploadController = {
    get paused() {
      return paused;
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
      for (const resume of waiters.splice(0)) {
        resume();
      }
    },
    cancel() {
      abort.abort();
      this.resume();
    },
  };
  if (options.controller) {
    options.controller.current = controller;
  }

  async function waitIfPaused(): Promise<void> {
    if (!paused) {
      return;
    }
    await new Promise<void>((resolve) => {
      waiters.push(resolve);
    });
  }

  function emitProgress(): void {
    const loaded = [...partProgress.values()].reduce((sum, value) => sum + value, 0);
    options.onProgress?.({
      loaded,
      total,
      percent: total === 0 ? 100 : Math.min(100, Math.round((loaded / total) * 100)),
      completedParts: [...partProgress.entries()].filter(([partNumber, value]) => {
        const start = (partNumber - 1) * partSize;
        const expected = Math.min(partSize, total - start);
        return value >= expected;
      }).length,
      totalParts,
    });
  }

  const confirmed: PublicMultipartPart[] = [];

  async function uploadOne(partNumber: number): Promise<void> {
    const start = (partNumber - 1) * partSize;
    const end = Math.min(start + partSize, total);
    const blob = file.slice(start, end);
    partProgress.set(partNumber, 0);

    let attempt = 0;
    for (;;) {
      await waitIfPaused();
      if (isAborted()) {
        throw new ApiClientError('STORAGE_UPLOAD_FAILED', 'Upload cancelled', 0);
      }

      try {
        const destination = await api.createPartDestination(uploadId, partNumber, {
          size: blob.size,
        });
        const transferred = await uploadBlobWithProgress(
          {
            upload: {
              id: uploadId,
              bucketId: '',
              key: '',
              status: 'UPLOADING',
              contentType: null,
              declaredSize: blob.size,
              expiresAt: destination.expiresAt,
              createdAt: destination.expiresAt,
              updatedAt: destination.expiresAt,
            },
            uploadUrl: destination.url,
            method: destination.method,
            expiresAt: destination.expiresAt,
            headers: destination.headers,
          },
          blob,
          {
            signal: abort.signal,
            onProgress: (event) => {
              partProgress.set(partNumber, event.loaded);
              emitProgress();
            },
          } satisfies UploadWithProgressOptions,
        );

        const etag = transferred.etag ?? destination.headers.etag ?? destination.headers.ETag;
        if (!etag) {
          throw new ApiClientError(
            'STORAGE_MULTIPART_INVALID_PART',
            `Part ${partNumber} did not return an etag`,
            400,
          );
        }
        const part = await api.confirmPart(uploadId, partNumber, {
          etag,
          size: transferred.size ?? blob.size,
          checksumSha256: transferred.checksumSha256,
        });
        confirmed.push(part);
        partProgress.set(partNumber, blob.size);
        emitProgress();
        return;
      } catch (error) {
        attempt += 1;
        if (isAborted() || attempt > maxRetries) {
          throw error;
        }
        await delay(Math.min(8_000, 250 * 2 ** (attempt - 1)));
      }
    }
  }

  const queue = Array.from({ length: totalParts }, (_, index) => index + 1);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < queue.length) {
      const partNumber = queue[cursor];
      cursor += 1;
      if (partNumber === undefined) {
        return;
      }
      await uploadOne(partNumber);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, () => worker()));

  const parts = confirmed
    .slice()
    .sort((left, right) => left.partNumber - right.partNumber)
    .map((part) => ({
      partNumber: part.partNumber,
      etag: part.etag,
      ...(part.checksumSha256 ? { checksumSha256: part.checksumSha256 } : {}),
    }));

  return api.completeMultipart(uploadId, parts);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
