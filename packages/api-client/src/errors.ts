import type { ApiErrorResponse, ApiFieldErrors } from '@vaultstack/types';
import type { HttpResponse } from './http.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readFields(value: unknown): ApiFieldErrors | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const fields: ApiFieldErrors = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string' && entry.length > 0) {
      fields[key] = entry;
    }
  }

  return Object.keys(fields).length > 0 ? fields : undefined;
}

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId?: string;
  readonly fields?: ApiFieldErrors;

  constructor(
    code: string,
    message: string,
    status: number,
    requestId?: string,
    fields?: ApiFieldErrors,
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
    this.requestId = requestId;
    this.fields = fields;
  }

  get hasFieldErrors(): boolean {
    return Object.keys(this.fields ?? {}).length > 0;
  }

  static async fromResponse(
    response: HttpResponse & { statusText?: string },
  ): Promise<ApiClientError> {
    let body: ApiErrorResponse | undefined;

    try {
      const parsed: unknown = await response.json();
      if (isRecord(parsed) && isRecord(parsed.error) && typeof parsed.error.code === 'string') {
        body = {
          error: {
            code: parsed.error.code,
            message: typeof parsed.error.message === 'string' ? parsed.error.message : 'Request failed',
            fields: readFields(parsed.error.fields),
          },
          requestId: typeof parsed.requestId === 'string' ? parsed.requestId : '',
        };
      }
    } catch {
      // Response body is not JSON.
    }

    return new ApiClientError(
      body?.error?.code ?? 'INTERNAL_ERROR',
      body?.error?.message ?? response.statusText ?? 'Request failed',
      response.status,
      body?.requestId,
      body?.error?.fields,
    );
  }
}
