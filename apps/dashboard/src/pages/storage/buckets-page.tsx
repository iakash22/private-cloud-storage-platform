import { useState } from 'react';
import {
  BucketDetails,
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
import { createBucketBodySchema, parseForm } from '@vaultstack/validation';
import { useAuth } from '../../context/auth-context.js';
import { useBuckets, useStorageProviders } from '../../hooks/use-storage.js';
import { apiClient } from '../../lib/api.js';
import { canDeleteStorage, canUploadStorage } from '../../lib/storage-preferences.js';
import { useFormSubmit } from '../../lib/form-errors.js';

export function BucketsPage() {
  const { permissions } = useAuth();
  const { buckets, loading, error, refresh } = useBuckets();
  const { providers } = useStorageProviders();
  const { fieldErrors, validate, catchError } = useFormSubmit();
  const [createOpen, setCreateOpen] = useState(false);
  const [bucketName, setBucketName] = useState('');
  const [storageProviderId, setStorageProviderId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | undefined>();
  const [selectedBucketId, setSelectedBucketId] = useState<string | undefined>();
  const [enableVersioning, setEnableVersioning] = useState(false);

  const selectedBucket = buckets.find((bucket) => bucket.id === selectedBucketId) ?? buckets[0];

  const handleCreate = async () => {
    const body = validate(
      parseForm(createBucketBodySchema, {
        name: bucketName,
        storageProviderId: storageProviderId || undefined,
        versioning: enableVersioning ? 'ENABLED' : undefined,
      }),
    );
    if (!body) {
      return;
    }
    try {
      await apiClient.createBucket(body);
      setCreateOpen(false);
      setBucketName('');
      setStorageProviderId('');
      setEnableVersioning(false);
      await refresh();
    } catch (caught) {
      catchError(caught);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    try {
      await apiClient.deleteBucket(deleteTarget);
      setDeleteTarget(undefined);
      await refresh();
    } catch (caught) {
      catchError(caught);
    }
  };

  const handleVersioning = async (versioning: 'ENABLED' | 'SUSPENDED') => {
    if (!selectedBucket) {
      return;
    }
    try {
      await apiClient.setBucketVersioning(selectedBucket.id, versioning);
      await refresh();
    } catch (caught) {
      catchError(caught);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Buckets</h2>
          <p className="text-sm text-slate-500">Create and inspect organization buckets.</p>
        </div>
        {canUploadStorage(permissions) ? (
          <Button
            type="button"
            onClick={() => {
              setCreateOpen(true);
            }}
          >
            Create bucket
          </Button>
        ) : null}
      </div>

      {error ? <EmptyState title="Unable to load buckets" description={error} /> : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bucket list</CardTitle>
            <CardDescription>
              {loading ? 'Loading buckets…' : `${buckets.length} buckets`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {buckets.map((bucket) => (
              <button
                key={bucket.id}
                type="button"
                className="flex w-full items-center justify-between rounded-md border border-slate-200 px-4 py-3 text-left hover:bg-slate-50"
                onClick={() => {
                  setSelectedBucketId(bucket.id);
                }}
              >
                <div>
                  <p className="font-medium text-slate-900">{bucket.name}</p>
                  <p className="text-xs text-slate-500">{bucket.versioning}</p>
                </div>
                {canDeleteStorage(permissions) ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      setDeleteTarget(bucket.id);
                    }}
                  >
                    Delete
                  </Button>
                ) : null}
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <BucketDetails bucket={selectedBucket} />
          {selectedBucket && canUploadStorage(permissions) ? (
            <div className="flex flex-wrap gap-2">
              {selectedBucket.versioning !== 'ENABLED' ? (
                <Button type="button" variant="outline" onClick={() => void handleVersioning('ENABLED')}>
                  Enable versioning
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleVersioning('SUSPENDED')}
                >
                  Suspend versioning
                </Button>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Create bucket"
        description="Bucket names must follow S3 naming rules."
        footer={
          <DialogActions
            cancelLabel="Cancel"
            confirmLabel="Create"
            confirmDisabled={false}
            onCancel={() => {
              setCreateOpen(false);
            }}
            onConfirm={() => void handleCreate()}
          />
        }
      >
        <div className="space-y-2">
          <Label htmlFor="bucket-name">Bucket name</Label>
          <Input
            id="bucket-name"
            value={bucketName}
            aria-invalid={Boolean(fieldErrors.name)}
            onChange={(event) => {
              setBucketName(event.target.value);
            }}
          />
          <FieldError message={fieldErrors.name} />
        </div>
        {providers.length > 1 ? (
          <div className="space-y-2">
            <Label htmlFor="bucket-provider">Storage provider</Label>
            <select
              id="bucket-provider"
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={storageProviderId}
              onChange={(event) => {
                setStorageProviderId(event.target.value);
              }}
            >
              <option value="">Default provider</option>
              {providers
                .filter((provider) => provider.status !== 'DISABLED')
                .map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                    {provider.isDefault ? ' (default)' : ''}
                  </option>
                ))}
            </select>
            <FieldError message={fieldErrors.storageProviderId} />
          </div>
        ) : null}
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={enableVersioning}
            onChange={(event) => setEnableVersioning(event.target.checked)}
          />
          Enable versioning
        </label>
      </Dialog>

      <DeleteConfirmation
        open={Boolean(deleteTarget)}
        title="Delete bucket"
        description="Buckets must be empty before deletion."
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(undefined);
          }
        }}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
