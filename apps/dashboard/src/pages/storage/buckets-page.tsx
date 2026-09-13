import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
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
  formatBytes,
  Input,
  Label,
  PageHeader,
  Select,
} from '@vaultstack/ui';
import {
  Activity,
  Archive,
  Database,
  FolderOpen,
  HardDrive,
  Link2,
  ScrollText,
  Share2,
  Workflow,
} from 'lucide-react';
import type { PublicBucketSummary } from '@vaultstack/types';
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
  const [summary, setSummary] = useState<PublicBucketSummary>();
  const [summaryLoading, setSummaryLoading] = useState(false);

  const selectedBucket = buckets.find((bucket) => bucket.id === selectedBucketId) ?? buckets[0];
  const defaultProvider = providers.find((provider) => provider.isDefault) ?? providers[0];

  useEffect(() => {
    if (!selectedBucket) {
      setSummary(undefined);
      return;
    }
    let cancelled = false;
    setSummaryLoading(true);
    void apiClient
      .getBucketSummary(selectedBucket.id)
      .then((next) => {
        if (!cancelled) {
          setSummary(next);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setSummary(undefined);
          catchError(caught);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSummaryLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [catchError, selectedBucket]);

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
            <Button
              type="button"
              onClick={() => {
                setCreateOpen(true);
              }}
            >
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
                    <p
                      className={`truncate font-medium ${selected ? 'text-white' : 'text-slate-900'}`}
                    >
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
                      className={
                        selected
                          ? 'border-slate-600 bg-transparent text-white hover:bg-slate-800'
                          : ''
                      }
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
          {selectedBucket ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Bucket control center</CardTitle>
                <CardDescription>
                  {summaryLoading
                    ? 'Refreshing bucket health…'
                    : `${summary?.provider.name ?? 'Provider'} · ${summary?.health ?? 'Unknown'}`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {summary ? (
                  <>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <SummaryMetric
                        icon={<HardDrive className="h-4 w-4" aria-hidden="true" />}
                        label="Objects"
                        value={String(summary.usage.objectCount)}
                      />
                      <SummaryMetric
                        icon={<FolderOpen className="h-4 w-4" aria-hidden="true" />}
                        label="Folders"
                        value={String(summary.usage.explicitFolderCount)}
                      />
                      <SummaryMetric
                        icon={<Share2 className="h-4 w-4" aria-hidden="true" />}
                        label="Active shares"
                        value={String(summary.activeShareCount)}
                      />
                      <SummaryMetric
                        icon={<Workflow className="h-4 w-4" aria-hidden="true" />}
                        label="Jobs"
                        value={String(summary.activeOperationCount)}
                      />
                    </div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                      {formatBytes(summary.usage.totalBytes)} stored · {summary.usage.versionCount}{' '}
                      versions · {summary.policyCount} policies
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        to={`/storage/files?bucket=${selectedBucket.id}`}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <FolderOpen className="h-4 w-4" aria-hidden="true" />
                        Browse files
                      </Link>
                      <Link
                        to="/storage/providers"
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Link2 className="h-4 w-4" aria-hidden="true" />
                        Provider
                      </Link>
                      <Link
                        to="/activity"
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Activity className="h-4 w-4" aria-hidden="true" />
                        Activity
                      </Link>
                      <Link
                        to="/storage/shares"
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Share2 className="h-4 w-4" aria-hidden="true" />
                        Shares
                      </Link>
                      <Link
                        to="/storage/policies"
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <ScrollText className="h-4 w-4" aria-hidden="true" />
                        Policies
                      </Link>
                      <Link
                        to="/backups"
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Archive className="h-4 w-4" aria-hidden="true" />
                        Backups
                      </Link>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">Bucket summary unavailable.</p>
                )}
              </CardContent>
            </Card>
          ) : null}
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
            onChange={(event) => {
              setEnableVersioning(event.target.checked);
            }}
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

function SummaryMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="flex items-center gap-2 text-slate-500">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}
