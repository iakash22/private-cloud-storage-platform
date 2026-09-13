import { useMemo, useState } from 'react';
import type { PublicTeam, ShareVisibilityName } from '@vaultstack/types';
import { Dialog, DialogActions } from '../dialog.js';
import { Input } from '../input.js';
import { Label } from '../label.js';
import { Button } from '../button.js';
import { FieldError } from '../field-error.js';
import { Select } from '../select.js';

export interface ShareDialogCreateInput {
  visibility: ShareVisibilityName;
  teamId?: string;
  password?: string;
  allowView: boolean;
  allowDownload: boolean;
  maxDownloads?: number;
  expiresAt: string;
}

export interface ShareDialogProps {
  open: boolean;
  objectName?: string;
  teams?: PublicTeam[];
  submitting?: boolean;
  error?: string | null;
  fieldErrors?: Record<string, string>;
  createdUrl?: string | null;
  onOpenChange: (open: boolean) => void;
  onCreate?: (input: ShareDialogCreateInput) => void;
}

function defaultExpiresAt(): string {
  const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

export function ShareDialog({
  open,
  objectName,
  teams = [],
  submitting = false,
  error,
  fieldErrors = {},
  createdUrl,
  onOpenChange,
  onCreate,
}: ShareDialogProps) {
  const [visibility, setVisibility] = useState<ShareVisibilityName>('PUBLIC_LINK');
  const [teamId, setTeamId] = useState('');
  const [password, setPassword] = useState('');
  const [allowView, setAllowView] = useState(true);
  const [allowDownload, setAllowDownload] = useState(true);
  const [maxDownloads, setMaxDownloads] = useState('');
  const [expiresAt, setExpiresAt] = useState(defaultExpiresAt);
  const [copied, setCopied] = useState(false);

  const canSubmit = useMemo(() => {
    if (!onCreate || submitting) {
      return false;
    }
    if (!allowView && !allowDownload) {
      return false;
    }
    if (visibility === 'TEAM' && !teamId) {
      return false;
    }
    return Boolean(expiresAt);
  }, [allowDownload, allowView, expiresAt, onCreate, submitting, teamId, visibility]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      dirty={
        Boolean(createdUrl) ||
        visibility !== 'PUBLIC_LINK' ||
        Boolean(teamId) ||
        Boolean(password.trim()) ||
        !allowView ||
        !allowDownload ||
        Boolean(maxDownloads.trim())
      }
      title="Share object"
      description="Create a time-limited share without exposing storage credentials or file paths."
      footer={
        createdUrl ? (
          <DialogActions
            cancelLabel="Close"
            confirmLabel="Done"
            onCancel={() => {
              onOpenChange(false);
            }}
            onConfirm={() => {
              onOpenChange(false);
            }}
          />
        ) : (
          <DialogActions
            cancelLabel="Cancel"
            confirmLabel={submitting ? 'Creating…' : 'Create link'}
            confirmDisabled={!canSubmit}
            onCancel={() => {
              onOpenChange(false);
            }}
            onConfirm={() => {
              onCreate?.({
                visibility,
                teamId: visibility === 'TEAM' ? teamId : undefined,
                password: password.length > 0 ? password : undefined,
                allowView,
                allowDownload,
                maxDownloads: maxDownloads ? Number(maxDownloads) : undefined,
                expiresAt: new Date(expiresAt).toISOString(),
              });
            }}
          />
        )
      }
    >
      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="share-object-name">Object</Label>
          <Input id="share-object-name" value={objectName ?? ''} readOnly />
        </div>

        {createdUrl ? (
          <div className="space-y-2">
            <Label htmlFor="share-created-url">Share link</Label>
            <div className="flex gap-2">
              <Input id="share-created-url" value={createdUrl} readOnly />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(createdUrl).then(() => {
                    setCopied(true);
                  });
                }}
              >
                {copied ? 'Copied' : 'Copy link'}
              </Button>
            </div>
            <p className="text-sm text-slate-500">
              This token is shown once. Recipients use the link; you can revoke it later from
              Shares.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="share-visibility">Visibility</Label>
              <Select
                id="share-visibility"
                aria-label="Visibility"
                value={visibility}
                onChange={(value) => {
                  setVisibility(value as ShareVisibilityName);
                }}
                options={[
                  { value: 'PRIVATE', label: 'Private (only you)' },
                  { value: 'TEAM', label: 'Team' },
                  { value: 'ORGANIZATION', label: 'Organization' },
                  { value: 'PUBLIC_LINK', label: 'Public link' },
                ]}
              />
            </div>

            {visibility === 'TEAM' ? (
              <div className="space-y-2">
                <Label htmlFor="share-team">Team</Label>
                <Select
                  id="share-team"
                  aria-label="Team"
                  value={teamId}
                  aria-invalid={Boolean(fieldErrors.teamId)}
                  onChange={setTeamId}
                  placeholder="Select a team"
                  options={[
                    { value: '', label: 'Select a team' },
                    ...teams.map((team) => ({ value: team.id, label: team.name })),
                  ]}
                />
                <FieldError message={fieldErrors.teamId} />
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="share-expires">Expiration</Label>
              <Input
                id="share-expires"
                type="datetime-local"
                value={expiresAt}
                aria-invalid={Boolean(fieldErrors.expiresAt)}
                onChange={(event) => {
                  setExpiresAt(event.target.value);
                }}
              />
              <FieldError message={fieldErrors.expiresAt} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="share-password">Password (optional)</Label>
              <Input
                id="share-password"
                type="password"
                autoComplete="new-password"
                value={password}
                aria-invalid={Boolean(fieldErrors.password)}
                onChange={(event) => {
                  setPassword(event.target.value);
                }}
              />
              <FieldError message={fieldErrors.password} />
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={allowView}
                onChange={(event) => {
                  setAllowView(event.target.checked);
                }}
              />
              Viewer permission
            </label>
            <FieldError message={fieldErrors.allowView ?? fieldErrors.allowDownload} />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={allowDownload}
                onChange={(event) => {
                  setAllowDownload(event.target.checked);
                }}
              />
              Download permission
            </label>

            <div className="space-y-2">
              <Label htmlFor="share-max-downloads">Download limit (optional)</Label>
              <Input
                id="share-max-downloads"
                type="number"
                min={1}
                value={maxDownloads}
                aria-invalid={Boolean(fieldErrors.maxDownloads)}
                onChange={(event) => {
                  setMaxDownloads(event.target.value);
                }}
              />
              <FieldError message={fieldErrors.maxDownloads} />
            </div>
          </>
        )}

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    </Dialog>
  );
}
