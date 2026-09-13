import { useEffect, useRef, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@vaultstack/ui';
import { useAuth } from '../context/auth-context.js';
import { apiClient } from '../lib/api.js';
import { onTwoFactorDeviceLinked } from '../lib/device-detect.js';

/**
 * Session + security side-effects: 401 auto-logout and 2FA device-link hooks.
 */
export function SessionGuard({ children }: { children: ReactNode }) {
  const { handleUnauthorized } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const handlingRef = useRef(false);

  useEffect(() => {
    apiClient.setOnUnauthorized(() => {
      if (handlingRef.current) {
        return;
      }
      handlingRef.current = true;

      const hadSession = handleUnauthorized();
      if (hadSession) {
        toast.error('Your session has expired. Please sign in again.');
      }
      navigate('/login', { replace: true });
      handlingRef.current = false;
    });

    return () => {
      apiClient.setOnUnauthorized(undefined);
    };
  }, [handleUnauthorized, navigate, toast]);

  useEffect(() => {
    return onTwoFactorDeviceLinked((detail) => {
      try {
        sessionStorage.setItem(
          'vaultstack:last-2fa-device',
          JSON.stringify({
            label: detail.device.label,
            email: detail.email,
            linkedAt: detail.linkedAt,
          }),
        );
      } catch {
        // Ignore private-mode / quota failures.
      }
    });
  }, []);

  return children;
}
