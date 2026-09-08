import type { InitiatedUpload } from '@vaultstack/types';
import { ApiClientError } from './errors.js';

export interface UploadProgressEvent {
  loaded: number;
  total: number;
  percent: number;
}

export interface UploadWithProgressOptions {
  onProgress?: (event: UploadProgressEvent) => void;
  signal?: AbortSignal;
}

export interface UploadTransferResult {
  etag?: string;
  size?: number;
  checksumSha256?: string;
}

export function uploadBlobWithProgress(
  initiated: InitiatedUpload,
  file: File | Blob,
  options: UploadWithProgressOptions = {},
): Promise<UploadTransferResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(initiated.method, initiated.uploadUrl, true);
    xhr.withCredentials = true;

    const contentType = file instanceof File ? file.type : 'application/octet-stream';
    if (contentType) {
      xhr.setRequestHeader('Content-Type', contentType);
    }

    if (initiated.headers) {
      for (const [key, value] of Object.entries(initiated.headers)) {
        xhr.setRequestHeader(key, value);
      }
    }

    xhr.upload.onprogress = (event: ProgressEvent) => {
      if (!event.lengthComputable || !options.onProgress) {
        return;
      }

      options.onProgress({
        loaded: event.loaded,
        total: event.total,
        percent: Math.round((event.loaded / event.total) * 100),
      });
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(readTransferResult(xhr));
        return;
      }

      reject(new ApiClientError('STORAGE_UPLOAD_FAILED', xhr.statusText, xhr.status));
    };

    xhr.onerror = () => {
      reject(new ApiClientError('STORAGE_UPLOAD_FAILED', 'Network error during upload', 0));
    };

    xhr.onabort = () => {
      reject(new ApiClientError('STORAGE_UPLOAD_FAILED', 'Upload cancelled', 0));
    };

    if (options.signal) {
      if (options.signal.aborted) {
        xhr.abort();
        return;
      }

      options.signal.addEventListener('abort', () => {
        xhr.abort();
      });
    }

    xhr.send(file);
  });
}

function readTransferResult(xhr: XMLHttpRequest): UploadTransferResult {
  const headerEtag = xhr.getResponseHeader('etag') ?? xhr.getResponseHeader('ETag') ?? undefined;
  try {
    const body = JSON.parse(xhr.responseText) as {
      part?: { etag?: string; size?: number; checksumSha256?: string };
      upload?: { checksum?: string };
    };
    return {
      etag: body.part?.etag ?? headerEtag?.replaceAll('"', ''),
      size: body.part?.size,
      checksumSha256: body.part?.checksumSha256 ?? body.upload?.checksum,
    };
  } catch {
    return { etag: headerEtag?.replaceAll('"', '') };
  }
}
