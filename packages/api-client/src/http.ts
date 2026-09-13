export interface HttpRequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  credentials?: 'include' | 'omit' | 'same-origin';
}

export interface HttpResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  json(): Promise<unknown>;
}

export type HttpFetch = (input: string, init?: HttpRequestInit) => Promise<HttpResponse>;

export const defaultHttpFetch: HttpFetch = async (input, init) => {
  const response = await fetch(input, init as RequestInit);
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    json: () => response.json(),
  };
};
