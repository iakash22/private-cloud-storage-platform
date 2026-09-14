import { cva } from 'class-variance-authority';
import { CircleAlert, CircleCheck, X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
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

const TOAST_LIMIT = 3;
const TOAST_DURATION_MS = 6_000;

const ToastContext = createContext<ToastApi | null>(null);

const toastVariants = cva(
  'vs-toast pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-lg border p-4 pr-10 shadow-lg',
  {
    variants: {
      tone: {
        error: 'border-red-200 bg-red-50 text-red-950',
        success: 'border-emerald-200 bg-emerald-50 text-emerald-950',
      },
    },
    defaultVariants: {
      tone: 'success',
    },
  },
);

function ToastIcon({ tone }: { tone: ToastTone }): ReactElement {
  if (tone === 'error') {
    return <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />;
  }
  return <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />;
}

function toastTitle(tone: ToastTone): string {
  return tone === 'error' ? 'Error' : 'Success';
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      onDismiss(toast.id);
    }, TOAST_DURATION_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [onDismiss, toast.id]);

  return (
    <li
      className={cn(toastVariants({ tone: toast.tone }))}
      role={toast.tone === 'error' ? 'alert' : 'status'}
    >
      <ToastIcon tone={toast.tone} />
      <div className="grid flex-1 gap-0.5">
        <p className="text-sm font-semibold leading-none tracking-tight">{toastTitle(toast.tone)}</p>
        <p className="text-sm leading-5 opacity-90">{toast.message}</p>
      </div>
      <button
        type="button"
        className="absolute right-2 top-2 rounded-md p-1 text-current opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        aria-label="Dismiss notification"
        onClick={() => {
          onDismiss(toast.id);
        }}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </li>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback((tone: ToastTone, message: string) => {
    const trimmed = message.trim();
    if (!trimmed) {
      return;
    }

    setToasts((current) => {
      const duplicate = current.find(
        (toast) => toast.tone === tone && toast.message === trimmed,
      );
      if (duplicate) {
        return current;
      }

      const id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      return [{ id, message: trimmed, tone }, ...current].slice(0, TOAST_LIMIT);
    });
  }, []);

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
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
        aria-live="polite"
        aria-label="Notifications"
      >
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={dismiss} />
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
