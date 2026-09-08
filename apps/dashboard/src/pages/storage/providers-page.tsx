import { useState } from 'react';
import { S3_DIALECTS, type S3DialectName } from '@vaultstack/types';
import {
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
  Input,
  Label,
} from '@vaultstack/ui';
import { useAuth } from '../../context/auth-context.js';
import { useStorageProviders } from '../../hooks/use-storage.js';
import { apiClient } from '../../lib/api.js';
import { canDeleteStorage, canUploadStorage } from '../../lib/storage-preferences.js';

const DIALECT_LABELS: Record<S3DialectName, string> = {
  AWS_S3: 'AWS S3',
  CLOUDFLARE_R2: 'Cloudflare R2',
  BACKBLAZE_B2: 'Backblaze B2',
  MINIO: 'MinIO',
  WASABI: 'Wasabi',
  DIGITALOCEAN_SPACES: 'DigitalOcean Spaces',
  GENERIC: 'Generic S3-compatible',
};

export function ProvidersPage() {
  const { permissions } = useAuth();
  const { providers, loading, error, refresh } = useStorageProviders();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | undefined>();
  const [actionError, setActionError] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [dialect, setDialect] = useState<S3DialectName>(S3_DIALECTS.MINIO);
  const [endpoint, setEndpoint] = useState('');
  const [region, setRegion] = useState('');
  const [bucket, setBucket] = useState('');
  const [accountId, setAccountId] = useState('');
  const [accessKeyId, setAccessKeyId] = useState('');
  const [secretAccessKey, setSecretAccessKey] = useState('');
  const [tls, setTls] = useState(false);
  const [forcePathStyle, setForcePathStyle] = useState(true);

  const resetForm = () => {
    setName('');
    setDialect(S3_DIALECTS.MINIO);
    setEndpoint('');
    setRegion('');
    setBucket('');
    setAccountId('');
    setAccessKeyId('');
    setSecretAccessKey('');
    setTls(false);
    setForcePathStyle(true);
  };

  const handleCreate = async () => {
    try {
      await apiClient.createStorageProvider({
        name: name.trim(),
        dialect,
        endpoint: endpoint.trim() || undefined,
        region: region.trim() || undefined,
        bucket: bucket.trim() || undefined,
        accountId: accountId.trim() || undefined,
        accessKeyId: accessKeyId.trim(),
        secretAccessKey,
        tls,
        forcePathStyle,
      });
      setCreateOpen(false);
      resetForm();
      setActionError(null);
      await refresh();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Unable to create provider');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    try {
      await apiClient.deleteStorageProvider(deleteTarget);
      setDeleteTarget(undefined);
      await refresh();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Unable to delete provider');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Storage providers</h2>
          <p className="text-sm text-slate-500">
            Connect S3-compatible endpoints. Secret keys are stored encrypted and never shown again.
          </p>
        </div>
        {canUploadStorage(permissions) ? (
          <Button
            type="button"
            onClick={() => {
              setCreateOpen(true);
            }}
          >
            Add provider
          </Button>
        ) : null}
      </div>

      {actionError ? <p className="text-sm text-red-600">{actionError}</p> : null}
      {testMessage ? <p className="text-sm text-slate-600">{testMessage}</p> : null}
      {error ? <EmptyState title="Unable to load providers" description={error} /> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configured providers</CardTitle>
          <CardDescription>
            {loading ? 'Loading providers…' : `${providers.length} providers`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {providers.map((provider) => (
            <div
              key={provider.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 px-4 py-3"
            >
              <div>
                <p className="font-medium text-slate-900">{provider.name}</p>
                <p className="text-xs text-slate-500">
                  {provider.type}
                  {provider.dialect ? ` · ${DIALECT_LABELS[provider.dialect]}` : ''}
                  {provider.isDefault ? ' · default' : ''}
                  {provider.endpoint ? ` · ${provider.endpoint}` : ''}
                  {provider.hasSecret ? ' · secret stored' : ''}
                </p>
              </div>
              <div className="flex gap-2">
                {canUploadStorage(permissions) ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void apiClient
                        .testStorageProvider(provider.id)
                        .then((health) => {
                          setTestMessage(health.message);
                        })
                        .catch((caught: unknown) => {
                          setActionError(
                            caught instanceof Error ? caught.message : 'Connection test failed',
                          );
                        });
                    }}
                  >
                    Test
                  </Button>
                ) : null}
                {canDeleteStorage(permissions) && !provider.isDefault ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDeleteTarget(provider.id);
                    }}
                  >
                    Delete
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Add storage provider"
        description="VaultStack never returns the secret access key after save."
        footer={
          <DialogActions
            cancelLabel="Cancel"
            confirmLabel="Save"
            confirmDisabled={!name.trim() || !accessKeyId.trim() || !secretAccessKey}
            onCancel={() => {
              setCreateOpen(false);
            }}
            onConfirm={() => void handleCreate()}
          />
        }
      >
        <div className="grid gap-3">
          <div className="space-y-2">
            <Label htmlFor="provider-name">Name</Label>
            <Input
              id="provider-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="provider-dialect">Provider</Label>
            <select
              id="provider-dialect"
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={dialect}
              onChange={(event) => {
                setDialect(event.target.value as S3DialectName);
              }}
            >
              {(Object.keys(DIALECT_LABELS) as S3DialectName[]).map((value) => (
                <option key={value} value={value}>
                  {DIALECT_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="provider-endpoint">Endpoint</Label>
            <Input
              id="provider-endpoint"
              value={endpoint}
              placeholder="https://s3.example.com"
              onChange={(event) => {
                setEndpoint(event.target.value);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="provider-region">Region</Label>
            <Input
              id="provider-region"
              value={region}
              onChange={(event) => {
                setRegion(event.target.value);
              }}
            />
          </div>
          {dialect === S3_DIALECTS.CLOUDFLARE_R2 ? (
            <div className="space-y-2">
              <Label htmlFor="provider-account">R2 account id</Label>
              <Input
                id="provider-account"
                value={accountId}
                onChange={(event) => {
                  setAccountId(event.target.value);
                }}
              />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="provider-bucket">Existing bucket (optional)</Label>
            <Input
              id="provider-bucket"
              value={bucket}
              onChange={(event) => {
                setBucket(event.target.value);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="provider-access-key">Access key</Label>
            <Input
              id="provider-access-key"
              value={accessKeyId}
              onChange={(event) => {
                setAccessKeyId(event.target.value);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="provider-secret">Secret key</Label>
            <Input
              id="provider-secret"
              type="password"
              autoComplete="new-password"
              value={secretAccessKey}
              onChange={(event) => {
                setSecretAccessKey(event.target.value);
              }}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={tls}
              onChange={(event) => {
                setTls(event.target.checked);
              }}
            />
            Require TLS
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={forcePathStyle}
              onChange={(event) => {
                setForcePathStyle(event.target.checked);
              }}
            />
            Path-style addressing
          </label>
        </div>
      </Dialog>

      <DeleteConfirmation
        open={Boolean(deleteTarget)}
        title="Delete storage provider"
        description="Providers that still have buckets cannot be deleted."
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
