import { type ReactNode, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/utils.js';
import { Button } from './button.js';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** When false, body prefers no scroll; footer always stays visible. Default true. */
  scrollable?: boolean;
  dirty?: boolean;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  scrollable = true,
  dirty: _dirty = false,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (!dialog.open) {
      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else {
        dialog.setAttribute('open', '');
      }
    }

    return () => {
      if (dialog.open) {
        if (typeof dialog.close === 'function') {
          dialog.close();
        } else {
          dialog.removeAttribute('open');
        }
      }
    };
  }, [open]);

  if (!open || typeof document === 'undefined') {
    return null;
  }

  const requestClose = () => {
    onOpenChange(false);
  };

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className={cn(
        'vs-dialog-enter fixed inset-0 z-[100] m-auto flex h-fit w-[min(100%-1rem,32rem)] max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl',
        scrollable ? 'max-h-[min(90dvh,40rem)]' : 'max-h-[min(92dvh,100%)]',
        className,
      )}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          requestClose();
        }
      }}
    >
      <div
        className={cn(
          'flex w-full flex-col',
          scrollable ? 'max-h-[min(90dvh,40rem)]' : 'h-fit max-h-[min(92dvh,100%)]',
        )}
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="shrink-0 space-y-1 border-b border-slate-200 px-5 py-3.5 sm:px-6 sm:py-4">
          <h2 id={titleId} className="font-display text-lg font-semibold tracking-tight text-slate-900">
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className="text-sm leading-5 text-slate-500">
              {description}
            </p>
          ) : null}
        </div>
        <div
          className={cn(
            'space-y-4 px-5 py-3.5 sm:px-6 sm:py-4',
            scrollable
              ? 'custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain'
              : 'overflow-visible max-sm:custom-scrollbar max-sm:max-h-[min(70dvh,28rem)] max-sm:overflow-y-auto',
          )}
        >
          {children}
        </div>
        {footer ? (
          <div className="shrink-0 border-t border-slate-200 bg-white px-5 py-3 sm:px-6 sm:py-3.5">
            <div className="flex justify-end gap-2">{footer}</div>
          </div>
        ) : null}
      </div>
    </dialog>,
    document.body,
  );
}

export function DialogActions({
  onCancel,
  onConfirm,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmDisabled = false,
  confirmLoading = false,
  confirmVariant = 'default',
}: {
  onCancel: () => void;
  onConfirm: () => unknown;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDisabled?: boolean;
  confirmLoading?: boolean;
  confirmVariant?: 'default' | 'outline';
}) {
  return (
    <>
      <Button type="button" variant="outline" onClick={onCancel} disabled={confirmLoading}>
        {cancelLabel}
      </Button>
      <Button
        type="button"
        variant={confirmVariant}
        onClick={onConfirm}
        disabled={confirmDisabled}
        loading={confirmLoading}
        loadingLabel={confirmLabel}
      >
        {confirmLabel}
      </Button>
    </>
  );
}
