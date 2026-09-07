import { Dialog, DialogActions } from '../dialog.js';
import { Input } from '../input.js';
import { Label } from '../label.js';

export interface ShareDialogProps {
  open: boolean;
  objectName?: string;
  onOpenChange: (open: boolean) => void;
}

export function ShareDialog({ open, objectName, onOpenChange }: ShareDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Share object"
      description="Sharing links and access policies will be available in a later phase."
      footer={
        <DialogActions
          cancelLabel="Close"
          confirmLabel="Coming soon"
          confirmDisabled
          onCancel={() => {
            onOpenChange(false);
          }}
          onConfirm={() => {
            onOpenChange(false);
          }}
        />
      }
    >
      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="share-object-name">Object</Label>
          <Input id="share-object-name" value={objectName ?? ''} readOnly />
        </div>
        <p className="text-sm text-slate-500">
          VaultStack will generate time-limited, organization-scoped share links without exposing
          storage credentials or internal paths.
        </p>
      </div>
    </Dialog>
  );
}
