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
  PageHeader,
  Select,
} from '@vaultstack/ui';
import { Database } from 'lucide-react';
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
  const defaultProvider = providers.find((provider) => provider.isDefault) ?? providers[0];

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
      <PageHeader
        title="Buckets"
        description="Create and inspect organization buckets."
        icon={<Database className="h-5 w-5" aria-hidden="true" />}
        actions={
          canUploadStorage(permissions) ? (
            <Button type="button" onClick={() => setCreateOpen(true)}>
              Create bucket
            </Button>
          ) : null
        }
      />

      {error ? <EmptyState title="Unable to load buckets" description={error} /> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bucket list</CardTitle>
            <CardDescription>
              {loading
                ? 'Loading buckets…'
                : `${buckets.length} bucket${buckets.length === 1 ? '' : 's'}`}
              {defaultProvider ? ` · Default provider ${defaultProvider.name}` : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="custom-scrollbar max-h-[min(60vh,34rem)] space-y-2 overflow-y-auto overscroll-contain">
            {buckets.length === 0 && !loading ? (
              <EmptyState
                title="No buckets"
                description="Create a bucket to start storing objects."
              />
            ) : null}
            {buckets.map((bucket) => {
              const selected = selectedBucket?.id === bucket.id;
              return (
                <button
                  key={bucket.id}
                  type="button"
                  className={
                    selected
                      ? 'flex w-full items-center justify-between rounded-xl border border-slate-900 bg-slate-900 px-4 py-3 text-left text-white shadow-sm'
                      : 'flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-50'
                  }
                  onClick={() => {
                    setSelectedBucketId(bucket.id);
                  }}
                >
                  <div className="min-w-0">
                    <p className={`truncate font-medium ${selected ? 'text-white' : 'text-slate-900'}`}>
                      {bucket.name}
                    </p>
                    <p className={`text-xs ${selected ? 'text-slate-300' : 'text-slate-500'}`}>
                      {bucket.versioning}
                    </p>
                  </div>
                  {canDeleteStorage(permissions) ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={selected ? 'border-slate-600 bg-transparent text-white hover:bg-slate-800' : ''}
                      onClick={(event) => {
                        event.stopPropagation();
                        setDeleteTarget(bucket.id);
                      }}
                    >
                      Delete
                    </Button>
                  ) : null}
                </button>
              );
            })}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <BucketDetails bucket={selectedBucket} />
          {selectedBucket && canUploadStorage(permissions) ? (
            <div className="flex flex-wrap gap-2">
              {selectedBucket.versioning !== 'ENABLED' ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleVersioning('ENABLED')}
                >
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
        dirty={Boolean(bucketName.trim()) || enableVersioning || Boolean(storageProviderId)}
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
          <p className="text-xs leading-5 text-slate-500">
            {defaultProvider
              ? `Using ${defaultProvider.name} (default). A bucket is a logical VaultStack namespace; it is not the same as an existing provider bucket.`
              : 'A bucket is a logical VaultStack namespace; it is not the same as an existing provider bucket.'}
          </p>
        </div>
        {providers.length > 1 ? (
          <div className="space-y-2">
            <Label htmlFor="bucket-provider">Storage provider</Label>
            <Select
              id="bucket-provider"
              aria-label="Storage provider"
              value={storageProviderId}
              onChange={setStorageProviderId}
              placeholder="Default provider"
              options={[
                { value: '', label: 'Default provider' },
                ...providers
                  .filter((provider) => provider.status !== 'DISABLED')
                  .map((provider) => ({
                    value: provider.id,
                    label: `${provider.name}${provider.isDefault ? ' (default)' : ''}`,
                  })),
              ]}
            />
            <FieldError message={fieldErrors.storageProviderId} />
          </div>
        ) : null}
        <label className="flex items-center gap-2.5 pt-1 text-sm text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300"
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
