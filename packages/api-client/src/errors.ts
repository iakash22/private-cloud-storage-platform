import type { ApiErrorResponse } from '@vaultstack/types';
import type { HttpResponse } from './http.js';

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId?: string;

  constructor(code: string, message: string, status: number, requestId?: string) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }

  static async fromResponse(response: HttpResponse & { statusText?: string }): Promise<ApiClientError> {
    let body: ApiErrorResponse | undefined;

    try {
      body = (await response.json()) as ApiErrorResponse;
    } catch {
      // Response body is not JSON.
    }

    return new ApiClientError(
      body?.error.code ?? 'INTERNAL_ERROR',
      body?.error.message ?? response.statusText ?? 'Request failed',
      response.status,
      body?.requestId,
    );
  }
}
