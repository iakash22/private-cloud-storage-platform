import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { cn } from '../lib/utils.js';

export type ToastTone = 'error' | 'success';

export interface ToastApi {
  error: (message: string) => void;
  success: (message: string) => void;
}

interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string) => {
      const trimmed = message.trim();
      if (!trimmed) {
        return;
      }

      const id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setToasts((current) => [...current, { id, message: trimmed, tone }]);
      window.setTimeout(() => {
        dismiss(id);
      }, 6000);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      error: (message) => {
        push('error', message);
      },
      success: (message) => {
        push('success', message);
      },
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ul
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
        aria-live="polite"
        aria-label="Notifications"
      >
        {toasts.map((toast) => (
          <li
            key={toast.id}
            className={cn(
              'pointer-events-auto rounded-md border px-4 py-3 text-sm shadow-lg',
              toast.tone === 'error'
                ? 'border-red-200 bg-red-50 text-red-800'
                : 'border-emerald-200 bg-emerald-50 text-emerald-800',
            )}
            role={toast.tone === 'error' ? 'alert' : 'status'}
          >
            {toast.message}
          </li>
        ))}
      </ul>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  return (
    useContext(ToastContext) ?? {
      error: () => undefined,
      success: () => undefined,
    }
  );
}
