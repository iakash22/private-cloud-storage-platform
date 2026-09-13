export const MULTIPART_SESSION_STORAGE_KEY = 'vaultstack:multipart-sessions';
export const SESSION_CLEARED_EVENT = 'vaultstack:session-cleared';

/** Wipe persisted multipart resume metadata from the browser. */
export function clearMultipartSessions(): void {
  try {
    localStorage.removeItem(MULTIPART_SESSION_STORAGE_KEY);
  } catch {
    // Ignore quota / private-mode failures.
  }
}

/** Notify listeners (upload queues, etc.) that the auth session was cleared. */
export function emitSessionCleared(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new Event(SESSION_CLEARED_EVENT));
}

export function onSessionCleared(handler: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }
  window.addEventListener(SESSION_CLEARED_EVENT, handler);
  return () => {
    window.removeEventListener(SESSION_CLEARED_EVENT, handler);
  };
}
