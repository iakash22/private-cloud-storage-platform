import { Dialog, DialogActions } from '../dialog.js';

export interface DeleteConfirmationProps {
  open: boolean;
  title: string;
  description: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  confirmLabel?: string;
  loading?: boolean;
}

export function DeleteConfirmation({
  open,
  title,
  description,
  onOpenChange,
  onConfirm,
  confirmLabel = 'Delete',
  loading = false,
}: DeleteConfirmationProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <DialogActions
          cancelLabel="Cancel"
          confirmLabel={loading ? 'Deleting…' : confirmLabel}
          confirmDisabled={loading}
          onCancel={() => {
            onOpenChange(false);
          }}
          onConfirm={onConfirm}
        />
      }
    >
      <p className="text-sm text-slate-600">
        This action cannot be undone from the dashboard once the storage engine permanently removes
        the object.
      </p>
    </Dialog>
  );
}
