import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
  serviceAccountId?: string | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runRequestContext<T>(context: RequestContext, callback: () => T): T {
  return storage.run(context, callback);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function setRequestServiceAccount(serviceAccountId: string): void {
  const context = storage.getStore();
  if (context) {
    context.serviceAccountId = serviceAccountId;
  }
}
