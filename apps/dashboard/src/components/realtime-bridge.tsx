import { useEffect, useRef, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@vaultstack/ui';
import type { RealtimeEvent } from '@vaultstack/types';
import { useAuth } from '../context/auth-context.js';
import { apiUrl } from '../lib/api.js';
import { connectRealtimeStream } from '../lib/realtime-client.js';

const RECONNECT_MS = 5_000;

export function RealtimeBridge({ children }: { children: ReactNode }) {
  const { user, activeOrganizationId, currentSessionId, handleUnauthorized } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const reconnectTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!user) {
      return;
    }

    const abort = new AbortController();
    let cancelled = false;

    const handleSecurityEvent = (event: RealtimeEvent): void => {
      if (event.type === 'session.revoked') {
        const payload = event.payload as { sessionId?: string; revokedBySelf?: boolean };
        if (payload.sessionId && currentSessionId && payload.sessionId === currentSessionId) {
          const hadSession = handleUnauthorized();
          if (hadSession) {
            toast.error(
              payload.revokedBySelf
                ? 'You signed out of this session.'
                : 'This session was revoked from another device.',
            );
          }
          navigate('/login', { replace: true });
        }
        return;
      }

      if (event.type === 'session.revoked_all') {
        const hadSession = handleUnauthorized();
        if (hadSession) {
          toast.error('Your account sessions were revoked.');
        }
        navigate('/login', { replace: true });
      }
    };

    const connect = async (): Promise<void> => {
      try {
        await connectRealtimeStream({
          apiUrl,
          organizationId: activeOrganizationId,
          signal: abort.signal,
          onEvent: handleSecurityEvent,
        });
      } catch (error: unknown) {
        if (cancelled || abort.signal.aborted) {
          return;
        }
        reconnectTimer.current = window.setTimeout(() => {
          void connect();
        }, RECONNECT_MS);
      }
    };

    void connect();

    return () => {
      cancelled = true;
      abort.abort();
      if (reconnectTimer.current !== null) {
        window.clearTimeout(reconnectTimer.current);
      }
    };
  }, [activeOrganizationId, currentSessionId, handleUnauthorized, navigate, toast, user]);

  return children;
}
