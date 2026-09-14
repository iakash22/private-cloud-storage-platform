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
  FieldError,
  Input,
  Label,
  PageHeader,
  PasswordInput,
  Select,
} from '@vaultstack/ui';
import { CloudCog } from 'lucide-react';
import {
  createStorageProviderBodySchema,
  parseForm,
  updateStorageProviderBodySchema,
} from '@vaultstack/validation';
import { useAuth } from '../../context/auth-context.js';
import { useStorageProviders } from '../../hooks/use-storage.js';
import { apiClient } from '../../lib/api.js';
import { canDeleteStorage, canUploadStorage } from '../../lib/storage-preferences.js';
import { useFormSubmit } from '../../lib/form-errors.js';

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
  const { fieldErrors, validate, catchError } = useFormSubmit();
  const [createOpen, setCreateOpen] = useState(false);
  const [editProviderId, setEditProviderId] = useState<string>();
  const [deleteTarget, setDeleteTarget] = useState<string | undefined>();
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
  const [isDefault, setIsDefault] = useState(false);
  const [status, setStatus] = useState<'ACTIVE' | 'DEGRADED' | 'DISABLED'>('ACTIVE');
  const editingLocalProvider =
    providers.find((provider) => provider.id === editProviderId)?.type === 'LOCAL_FILESYSTEM';

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
    setIsDefault(false);
    setStatus('ACTIVE');
  };

  const openEdit = (providerId: string) => {
    const provider = providers.find((item) => item.id === providerId);
    if (!provider) {
      return;
    }
    setEditProviderId(provider.id);
    setName(provider.name);
    setDialect(provider.dialect ?? S3_DIALECTS.GENERIC);
    setEndpoint(provider.endpoint ?? '');
    setRegion(provider.region ?? '');
    setBucket(provider.bucket ?? '');
    setAccountId(provider.accountId ?? '');
    setAccessKeyId(provider.accessKeyId ?? '');
    setSecretAccessKey('');
    setTls(provider.tls ?? false);
    setForcePathStyle(provider.forcePathStyle ?? true);
    setIsDefault(provider.isDefault);
    setStatus(
      provider.status === 'DEGRADED' || provider.status === 'DISABLED' ? provider.status : 'ACTIVE',
    );
  };

  const handleCreate = async () => {
    const body = validate(
      parseForm(createStorageProviderBodySchema, {
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
      }),
    );
    if (!body) {
      return;
    }
    try {
      const created = await apiClient.createStorageProvider(body);
      setCreateOpen(false);
      resetForm();
      const health = await apiClient.testStorageProvider(created.id);
      setTestMessage(health.message);
      await refresh();
    } catch (caught) {
      catchError(caught);
    }
  };

  const handleUpdate = async () => {
    if (!editProviderId) {
      return;
    }
    const body = validate(
      parseForm(updateStorageProviderBodySchema, {
        name: name.trim(),
        endpoint: endpoint.trim() || null,
        region: region.trim() || null,
        bucket: bucket.trim() || null,
        accountId: accountId.trim() || null,
        accessKeyId: accessKeyId.trim() || undefined,
        secretAccessKey: secretAccessKey || undefined,
        tls,
        forcePathStyle,
        isDefault,
        status,
      }),
    );
    if (!body) {
      return;
    }
    try {
      await apiClient.updateStorageProvider(editProviderId, body);
      setEditProviderId(undefined);
      resetForm();
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
      await apiClient.deleteStorageProvider(deleteTarget);
      setDeleteTarget(undefined);
      await refresh();
    } catch (caught) {
      catchError(caught);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Storage providers"
        description="Connect S3-compatible endpoints. Local storage uses STORAGE_LOCAL_ROOT."
        icon={<CloudCog className="h-5 w-5" aria-hidden="true" />}
        actions={
          canUploadStorage(permissions) ? (
            <Button type="button" onClick={() => { setCreateOpen(true); }}>
              Add provider
            </Button>
          ) : null
        }
      />
      <p className="-mt-4 text-sm text-slate-500">
        <a
          className="text-slate-900 underline"
          href="/docs/usage/frontend.md"
          target="_blank"
          rel="noreferrer"
        >
          Read the usage guide
        </a>
      </p>

      {testMessage ? <p className="text-sm text-slate-600">{testMessage}</p> : null}
      {error ? <EmptyState title="Unable to load providers" description={error} /> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Provider setup guide</CardTitle>
          <CardDescription>
            Provider credentials stay server-side. The browser only receives short-lived upload and
            download URLs.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm text-slate-600 lg:grid-cols-3">
          <div>
            <p className="font-medium text-slate-900">Local filesystem</p>
            <p className="mt-1">
              Keep endpoint and keys empty. Configure <code>STORAGE_DRIVER=local</code> and{' '}
              <code>STORAGE_LOCAL_ROOT</code> on the API host.
            </p>
          </div>
          <div>
            <p className="font-medium text-slate-900">MinIO</p>
            <p className="mt-1">
              Start the development profile, then use dialect <code>MINIO</code>, endpoint{' '}
              <code>http://localhost:9000</code>, path-style addressing, and the server-side MinIO
              credentials.
            </p>
          </div>
          <div>
            <p className="font-medium text-slate-900">API usage</p>
            <p className="mt-1">
              Create a bucket after saving the provider. Use the SDK for REST uploads or the
              optional S3 gateway for AWS-compatible bucket clients.
            </p>
            <a
              className="mt-2 inline-block font-medium text-slate-900 underline"
              href="/docs/usage/storage.md"
              target="_blank"
              rel="noreferrer"
            >
              Open provider API instructions
            </a>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configured providers</CardTitle>
          <CardDescription>
            {loading ? 'Loading providers…' : `${providers.length} providers`}
          </CardDescription>
        </CardHeader>
        <CardContent className="max-h-[min(60vh,34rem)] space-y-2 overflow-y-auto overscroll-contain">
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
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => { openEdit(provider.id); }}
                    >
                      Edit
                    </Button>
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
                            catchError(caught);
                          });
                      }}
                    >
                      Test
                    </Button>
                  </>
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
            confirmDisabled={false}
            onCancel={() => {
              setCreateOpen(false);
            }}
            onConfirm={() => void handleCreate()}
          />
        }
      >
        <div className="grid gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setDialect(S3_DIALECTS.MINIO);
              setEndpoint('http://localhost:9000');
              setRegion('us-east-1');
              setBucket('vaultstack');
              setTls(false);
              setForcePathStyle(true);
            }}
          >
            Use local MinIO defaults
          </Button>
          <div className="space-y-2">
            <Label htmlFor="provider-name">Name</Label>
            <Input
              id="provider-name"
              value={name}
              aria-invalid={Boolean(fieldErrors.name)}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
            <FieldError message={fieldErrors.name} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="provider-dialect">Provider</Label>
            <Select
              id="provider-dialect"
              aria-label="Provider"
              value={dialect}
              onChange={(value) => {
                setDialect(value as S3DialectName);
              }}
              options={(Object.keys(DIALECT_LABELS) as S3DialectName[]).map((value) => ({
                value,
                label: DIALECT_LABELS[value],
              }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="provider-endpoint">Endpoint</Label>
            <Input
              id="provider-endpoint"
              value={endpoint}
              placeholder="https://s3.example.com"
              aria-invalid={Boolean(fieldErrors.endpoint)}
              onChange={(event) => {
                setEndpoint(event.target.value);
              }}
            />
            <FieldError message={fieldErrors.endpoint} />
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
              aria-invalid={Boolean(fieldErrors.accessKeyId)}
              onChange={(event) => {
                setAccessKeyId(event.target.value);
              }}
            />
            <FieldError message={fieldErrors.accessKeyId} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="provider-secret">Secret key</Label>
            <PasswordInput
              id="provider-secret"
              autoComplete="new-password"
              value={secretAccessKey}
              aria-invalid={Boolean(fieldErrors.secretAccessKey)}
              onChange={(event) => {
                setSecretAccessKey(event.target.value);
              }}
            />
            <FieldError message={fieldErrors.secretAccessKey} />
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

      <Dialog
        open={Boolean(editProviderId)}
        onOpenChange={(open) => {
          if (!open) {
            setEditProviderId(undefined);
            resetForm();
          }
        }}
        title="Edit storage provider"
        description="Leave the secret key blank to keep the stored credential."
        footer={
          <DialogActions
            cancelLabel="Cancel"
            confirmLabel="Save"
            confirmDisabled={!name.trim()}
            onCancel={() => {
              setEditProviderId(undefined);
              resetForm();
            }}
            onConfirm={() => void handleUpdate()}
          />
        }
      >
        <div className="grid gap-3">
          <div className="space-y-2">
            <Label htmlFor="edit-provider-name">Name</Label>
            <Input
              id="edit-provider-name"
              value={name}
              aria-invalid={Boolean(fieldErrors.name)}
              onChange={(event) => { setName(event.target.value); }}
            />
            <FieldError message={fieldErrors.name} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-provider-endpoint">Endpoint</Label>
            <Input
              id="edit-provider-endpoint"
              value={endpoint}
              disabled={editingLocalProvider}
              aria-invalid={Boolean(fieldErrors.endpoint)}
              onChange={(event) => { setEndpoint(event.target.value); }}
            />
            <FieldError message={fieldErrors.endpoint} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-provider-region">Region</Label>
            <Input
              id="edit-provider-region"
              value={region}
              disabled={editingLocalProvider}
              onChange={(event) => { setRegion(event.target.value); }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-provider-bucket">Existing bucket (optional)</Label>
            <Input
              id="edit-provider-bucket"
              value={bucket}
              disabled={editingLocalProvider}
              onChange={(event) => { setBucket(event.target.value); }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-provider-access-key">Access key</Label>
            <Input
              id="edit-provider-access-key"
              value={accessKeyId}
              disabled={editingLocalProvider}
              aria-invalid={Boolean(fieldErrors.accessKeyId)}
              onChange={(event) => { setAccessKeyId(event.target.value); }}
            />
            <FieldError message={fieldErrors.accessKeyId} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-provider-secret">Secret key</Label>
            <PasswordInput
              id="edit-provider-secret"
              autoComplete="new-password"
              value={secretAccessKey}
              disabled={editingLocalProvider}
              aria-invalid={Boolean(fieldErrors.secretAccessKey)}
              onChange={(event) => { setSecretAccessKey(event.target.value); }}
            />
            <FieldError message={fieldErrors.secretAccessKey} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-provider-status">Status</Label>
            <Select
              id="edit-provider-status"
              aria-label="Status"
              value={status}
              onChange={(value) => { setStatus(value as 'ACTIVE' | 'DEGRADED' | 'DISABLED'); }}
              options={[
                { value: 'ACTIVE', label: 'Active' },
                { value: 'DEGRADED', label: 'Degraded' },
                { value: 'DISABLED', label: 'Disabled' },
              ]}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={tls}
              onChange={(event) => { setTls(event.target.checked); }}
            />
            Require TLS
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={forcePathStyle}
              onChange={(event) => { setForcePathStyle(event.target.checked); }}
            />
            Path-style addressing
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(event) => { setIsDefault(event.target.checked); }}
            />
            Default provider
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
