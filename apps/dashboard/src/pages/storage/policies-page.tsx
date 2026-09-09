import { useCallback, useEffect, useState } from 'react';
import {
  STORAGE_LIFECYCLE_ACTIONS,
  type PublicStoragePolicy,
  type StorageLifecycleActionName,
} from '@vaultstack/types';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DeleteConfirmation,
  Dialog,
  DialogActions,
  EmptyState,
  FieldError,
  Input,
  Label,
} from '@vaultstack/ui';
import { createLifecyclePolicyBodySchema, parseForm } from '@vaultstack/validation';
import { useAuth } from '../../context/auth-context.js';
import { useBuckets } from '../../hooks/use-storage.js';
import { apiClient } from '../../lib/api.js';
import { canDeleteStorage, canUploadStorage } from '../../lib/storage-preferences.js';
import { useFormSubmit } from '../../lib/form-errors.js';

const LIFECYCLE_LABELS: Record<StorageLifecycleActionName, string> = {
  EXPIRE_CURRENT: 'Expire current objects',
  EXPIRE_NONCURRENT: 'Expire noncurrent versions',
  ABORT_INCOMPLETE_MULTIPART: 'Abort incomplete multipart uploads',
  EXPIRE_TEMPORARY: 'Expire temporary uploads',
};

export function PoliciesPage() {
  const { permissions } = useAuth();
  const { buckets } = useBuckets();
  const { fieldErrors, validate, catchError } = useFormSubmit();
  const [policies, setPolicies] = useState<PublicStoragePolicy[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editPolicy, setEditPolicy] = useState<PublicStoragePolicy | null>(null);
  const [deleteId, setDeleteId] = useState<string>();
  const [name, setName] = useState('');
  const [bucketId, setBucketId] = useState('');
  const [keyPrefix, setKeyPrefix] = useState('');
  const [days, setDays] = useState('30');
  const [lifecycleAction, setLifecycleAction] = useState<StorageLifecycleActionName>(
    STORAGE_LIFECYCLE_ACTIONS.EXPIRE_CURRENT,
  );
  const [enabled, setEnabled] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setPolicies(await apiClient.listPolicies());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load policies');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const resetForm = () => {
    setName('');
    setBucketId('');
    setKeyPrefix('');
    setDays('30');
    setLifecycleAction(STORAGE_LIFECYCLE_ACTIONS.EXPIRE_CURRENT);
    setEnabled(true);
  };

  const handleCreate = async () => {
    const body = validate(
      parseForm(createLifecyclePolicyBodySchema, {
        name: name.trim(),
        bucketId: bucketId || undefined,
        keyPrefix: keyPrefix.trim() || undefined,
        days: Number(days),
        lifecycleAction,
        enabled,
      }),
    );
    if (!body) {
      return;
    }
    try {
      await apiClient.createLifecyclePolicy(body);
      setCreateOpen(false);
      resetForm();
      await refresh();
    } catch (caught) {
      catchError(caught);
    }
  };

  const handleUpdate = async () => {
    if (!editPolicy) {
      return;
    }
    try {
      await apiClient.updateLifecyclePolicy(editPolicy.id, {
        name: name.trim(),
        keyPrefix: keyPrefix.trim() || null,
        days: Number(days),
        lifecycleAction,
        enabled,
      });
      setEditPolicy(null);
      resetForm();
      await refresh();
    } catch (caught) {
      catchError(caught);
    }
  };

  const openEdit = (policy: PublicStoragePolicy) => {
    setEditPolicy(policy);
    setName(policy.name);
    setKeyPrefix(policy.keyPrefix ?? '');
    setDays(policy.days ? String(policy.days) : '30');
    setLifecycleAction(policy.lifecycleAction ?? STORAGE_LIFECYCLE_ACTIONS.EXPIRE_CURRENT);
    setEnabled(policy.enabled);
  };

  const bucketName = (id: string | null) =>
    buckets.find((bucket) => bucket.id === id)?.name ?? (id ? 'Unknown bucket' : 'All buckets');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Lifecycle policies</h2>
          <p className="text-sm text-slate-500">
            Expire objects, prune noncurrent versions, and abort stalled multipart uploads.
          </p>
        </div>
        {canUploadStorage(permissions) ? (
          <Button
            type="button"
            onClick={() => {
              resetForm();
              setCreateOpen(true);
            }}
          >
            Create policy
          </Button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {policies.length === 0 ? (
        <EmptyState
          title="No lifecycle policies"
          description="Create a policy to expire objects after a number of days."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Policies</CardTitle>
            <CardDescription>{policies.length} configured</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {policies.map((policy) => (
              <div
                key={policy.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 px-4 py-3"
              >
                <div>
                  <p className="font-medium text-slate-900">{policy.name}</p>
                  <p className="text-xs text-slate-500">
                    {policy.lifecycleAction
                      ? LIFECYCLE_LABELS[policy.lifecycleAction]
                      : policy.kind}{' '}
                    · {policy.days ?? '—'} days · {bucketName(policy.bucketId)}
                    {policy.keyPrefix ? ` · prefix ${policy.keyPrefix}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={policy.enabled ? undefined : 'bg-slate-100 text-slate-600'}>
                    {policy.enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                  {canUploadStorage(permissions) ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => openEdit(policy)}>
                      Edit
                    </Button>
                  ) : null}
                  {canDeleteStorage(permissions) ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setDeleteId(policy.id)}
                    >
                      Delete
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Create lifecycle policy"
        footer={
          <DialogActions
            confirmLabel="Create"
            confirmDisabled={!name.trim() || Number(days) < 1}
            onCancel={() => setCreateOpen(false)}
            onConfirm={() => void handleCreate()}
          />
        }
      >
        <PolicyForm
          name={name}
          bucketId={bucketId}
          keyPrefix={keyPrefix}
          days={days}
          lifecycleAction={lifecycleAction}
          enabled={enabled}
          buckets={buckets.map((bucket) => ({ id: bucket.id, name: bucket.name }))}
          showBucket
          fieldErrors={fieldErrors}
          onName={setName}
          onBucketId={setBucketId}
          onKeyPrefix={setKeyPrefix}
          onDays={setDays}
          onAction={setLifecycleAction}
          onEnabled={setEnabled}
        />
      </Dialog>

      <Dialog
        open={Boolean(editPolicy)}
        onOpenChange={(open) => {
          if (!open) {
            setEditPolicy(null);
          }
        }}
        title="Edit lifecycle policy"
        footer={
          <DialogActions
            confirmLabel="Save"
            confirmDisabled={!name.trim() || Number(days) < 1}
            onCancel={() => setEditPolicy(null)}
            onConfirm={() => void handleUpdate()}
          />
        }
      >
        <PolicyForm
          name={name}
          bucketId={bucketId}
          keyPrefix={keyPrefix}
          days={days}
          lifecycleAction={lifecycleAction}
          enabled={enabled}
          buckets={buckets.map((bucket) => ({ id: bucket.id, name: bucket.name }))}
          showBucket={false}
          fieldErrors={fieldErrors}
          onName={setName}
          onBucketId={setBucketId}
          onKeyPrefix={setKeyPrefix}
          onDays={setDays}
          onAction={setLifecycleAction}
          onEnabled={setEnabled}
        />
      </Dialog>

      <DeleteConfirmation
        open={Boolean(deleteId)}
        title="Delete policy"
        description="Objects will no longer be expired by this rule."
        onOpenChange={(open) => {
          if (!open) {
            setDeleteId(undefined);
          }
        }}
        onConfirm={() => {
          if (!deleteId) {
            return;
          }
          void apiClient
            .deletePolicy(deleteId)
            .then(() => {
              setDeleteId(undefined);
              return refresh();
            })
            .catch((caught: unknown) => {
              catchError(caught);
            });
        }}
      />
    </div>
  );
}

function PolicyForm({
  name,
  bucketId,
  keyPrefix,
  days,
  lifecycleAction,
  enabled,
  buckets,
  showBucket,
  fieldErrors,
  onName,
  onBucketId,
  onKeyPrefix,
  onDays,
  onAction,
  onEnabled,
}: {
  name: string;
  bucketId: string;
  keyPrefix: string;
  days: string;
  lifecycleAction: StorageLifecycleActionName;
  enabled: boolean;
  buckets: { id: string; name: string }[];
  showBucket: boolean;
  fieldErrors: Record<string, string>;
  onName: (value: string) => void;
  onBucketId: (value: string) => void;
  onKeyPrefix: (value: string) => void;
  onDays: (value: string) => void;
  onAction: (value: StorageLifecycleActionName) => void;
  onEnabled: (value: boolean) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="policy-name">Name</Label>
        <Input
          id="policy-name"
          value={name}
          aria-invalid={Boolean(fieldErrors.name)}
          onChange={(event) => onName(event.target.value)}
        />
        <FieldError message={fieldErrors.name} />
      </div>
      {showBucket ? (
        <div>
          <Label htmlFor="policy-bucket">Bucket</Label>
          <select
            id="policy-bucket"
            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
            value={bucketId}
            onChange={(event) => onBucketId(event.target.value)}
          >
            <option value="">All buckets</option>
            {buckets.map((bucket) => (
              <option key={bucket.id} value={bucket.id}>
                {bucket.name}
              </option>
            ))}
          </select>
          <FieldError message={fieldErrors.bucketId} />
        </div>
      ) : null}
      <div>
        <Label htmlFor="policy-prefix">Key prefix</Label>
        <Input
          id="policy-prefix"
          value={keyPrefix}
          onChange={(event) => onKeyPrefix(event.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="policy-days">Days</Label>
        <Input id="policy-days" inputMode="numeric" value={days} aria-invalid={Boolean(fieldErrors.days)} onChange={(event) => onDays(event.target.value)} />
        <FieldError message={fieldErrors.days} />
      </div>
      <div>
        <Label htmlFor="policy-action">Action</Label>
        <select
          id="policy-action"
          className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
          value={lifecycleAction}
          onChange={(event) => onAction(event.target.value as StorageLifecycleActionName)}
        >
          {(Object.keys(LIFECYCLE_LABELS) as StorageLifecycleActionName[]).map((action) => (
            <option key={action} value={action}>
              {LIFECYCLE_LABELS[action]}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={enabled} onChange={(event) => onEnabled(event.target.checked)} />
        Enabled
      </label>
    </div>
  );
}
