import { type ReactNode, useEffect, useRef } from 'react';
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
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
    }

    if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="dialog-title"
      aria-describedby={description ? 'dialog-description' : undefined}
      className={cn(
        'fixed inset-0 z-50 m-auto w-full max-w-lg rounded-lg border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/40',
        className,
      )}
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          onOpenChange(false);
        }
      }}
    >
      <div className="flex flex-col">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 id="dialog-title" className="text-lg font-semibold text-slate-900">
            {title}
          </h2>
          {description ? (
            <p id="dialog-description" className="mt-1 text-sm text-slate-500">
              {description}
            </p>
          ) : null}
        </div>
        <div className="px-6 py-4">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">{footer}</div> : null}
      </div>
    </dialog>
  );
}

export function DialogActions({
  onCancel,
  onConfirm,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmDisabled = false,
  confirmVariant = 'default',
}: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDisabled?: boolean;
  confirmVariant?: 'default' | 'outline';
}) {
  return (
    <>
      <Button type="button" variant="outline" onClick={onCancel}>
        {cancelLabel}
      </Button>
      <Button type="button" variant={confirmVariant} onClick={onConfirm} disabled={confirmDisabled}>
        {confirmLabel}
      </Button>
    </>
  );
}
