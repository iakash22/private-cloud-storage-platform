import { useEffect } from 'react';
import { REALTIME_EVENT_NAME, type RealtimeEvent, type RealtimeEventType } from '@vaultstack/types';

export function useRealtimeSubscription(
  types: RealtimeEventType[],
  handler: (event: RealtimeEvent) => void,
): void {
  useEffect(() => {
    const allowed = new Set(types);
    const listener = (event: Event): void => {
      const detail = (event as CustomEvent<RealtimeEvent>).detail;
      if (!allowed.has(detail.type)) {
        return;
      }
      handler(detail);
    };

    window.addEventListener(REALTIME_EVENT_NAME, listener);
    return () => {
      window.removeEventListener(REALTIME_EVENT_NAME, listener);
    };
  }, [handler, types]);
}
