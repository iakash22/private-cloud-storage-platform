export interface RequestMeta {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface RequestCookies {
  vs_session?: string;
  vs_csrf?: string;
  vs_org?: string;
}

export interface RequestHeaders {
  authorization?: string;
  'x-csrf-token'?: string;
  cookie?: string;
}

export type HttpStatus = 200 | 201 | 204 | 400 | 401 | 403 | 404 | 409 | 429 | 500;

export interface ApiResult<TBody, TStatus extends HttpStatus = 200> {
  status: TStatus;
  body: TBody;
}
