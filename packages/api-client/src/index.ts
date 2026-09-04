import type { HealthResponse, ReadinessResponse } from '@vaultstack/types';

export interface ApiClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export class VaultStackApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async getHealth(): Promise<HealthResponse> {
    return this.getJson<HealthResponse>('/health');
  }

  async getReady(): Promise<ReadinessResponse> {
    return this.getJson<ReadinessResponse>('/ready');
  }

  private async getJson<T>(path: string): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`);

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as T;
  }
}

export function createApiClient(baseUrl: string): VaultStackApiClient {
  return new VaultStackApiClient({ baseUrl });
}
