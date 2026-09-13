import { ORGANIZATION_HEADER_NAME, REALTIME_EVENT_NAME, type RealtimeEvent } from '@vaultstack/types';

function parseSseChunk(chunk: string): RealtimeEvent | null {
  const lines = chunk.split('\n');
  let data: string | null = null;
  for (const line of lines) {
    if (line.startsWith('data:')) {
      data = line.slice(5).trimStart();
    }
  }
  if (!data) {
    return null;
  }
  try {
    return JSON.parse(data) as RealtimeEvent;
  } catch {
    return null;
  }
}

export interface RealtimeConnectionOptions {
  apiUrl: string;
  organizationId: string | null;
  signal: AbortSignal;
  onEvent: (event: RealtimeEvent) => void;
  onError?: (error: unknown) => void;
}

export async function connectRealtimeStream(options: RealtimeConnectionOptions): Promise<void> {
  const headers: Record<string, string> = {
    Accept: 'text/event-stream',
  };
  if (options.organizationId) {
    headers[ORGANIZATION_HEADER_NAME] = options.organizationId;
  }

  const response = await fetch(`${options.apiUrl}/api/v1/realtime/events`, {
    method: 'GET',
    credentials: 'include',
    headers,
    signal: options.signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`Realtime connection failed (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return;
    }
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const event = parseSseChunk(frame);
      if (event) {
        options.onEvent(event);
        window.dispatchEvent(new CustomEvent(REALTIME_EVENT_NAME, { detail: event }));
      }
      boundary = buffer.indexOf('\n\n');
    }
  }
}
