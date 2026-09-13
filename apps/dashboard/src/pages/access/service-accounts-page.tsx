import { useCallback, useEffect, useState } from 'react';
import { PERMISSIONS, type PublicS3AccessCredential, type PublicServiceAccount } from '@vaultstack/types';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  EmptyState,
  FieldError,
  formatDate,
  Input,
  Label,
  PageHeader,
} from '@vaultstack/ui';
import { Bot } from 'lucide-react';
import { createS3CredentialBodySchema, parseForm, updateS3CredentialBodySchema } from '@vaultstack/validation';
import { useAuth } from '../../context/auth-context.js';
import { apiClient } from '../../lib/api.js';
import { canManageAccess } from '../../lib/dashboard-permissions.js';
import { useFormSubmit } from '../../lib/form-errors.js';

const S3_PERMISSIONS = [
  PERMISSIONS.STORAGE_READ,
  PERMISSIONS.STORAGE_UPLOAD,
  PERMISSIONS.STORAGE_DELETE,
  PERMISSIONS.STORAGE_SHARE,
  PERMISSIONS.ARTIFACT_READ,
  PERMISSIONS.ARTIFACT_UPLOAD,
  PERMISSIONS.ARTIFACT_DELETE,
  PERMISSIONS.BACKUP_READ,
  PERMISSIONS.BACKUP_CREATE,
  PERMISSIONS.BACKUP_RESTORE,
  PERMISSIONS.BACKUP_DELETE,
] as const;

export function ServiceAccountsPage() {
  const { activeOrganizationId, permissions } = useAuth();
  const manage = canManageAccess(permissions);
  const { fieldErrors, validate, catchError } = useFormSubmit();
  const [accounts, setAccounts] = useState<PublicServiceAccount[]>([]);
  const [credentials, setCredentials] = useState<PublicS3AccessCredential[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([PERMISSIONS.STORAGE_READ]);
  const [secret, setSecret] = useState<{ accessKeyId: string; secretAccessKey: string } | null>(null);
  const [editCredential, setEditCredential] = useState<PublicS3AccessCredential | null>(null);
  const [editPermissions, setEditPermissions] = useState<string[]>([]);
  const [allowedBuckets, setAllowedBuckets] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  const refresh = useCallback(async () => {
    if (!activeOrganizationId) {
      return;
    }
    try {
      const [nextAccounts, nextCredentials] = await Promise.all([
        apiClient.listServiceAccounts(activeOrganizationId),
        apiClient.listS3Credentials(activeOrganizationId),
      ]);
      setAccounts(nextAccounts);
      setCredentials(nextCredentials);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load service accounts');
    }
  }, [activeOrganizationId]);

  useEffect(() => {
    if (manage) {
      void refresh();
    }
  }, [manage, refresh]);

  const togglePermission = (key: string) => {
    setSelectedPermissions((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  };

  const handleCreate = async () => {
    if (!activeOrganizationId) {
      return;
    }
    const body = validate(
      parseForm(createS3CredentialBodySchema, {
        serviceAccountName: name.trim(),
        description: description.trim() || undefined,
        permissions: selectedPermissions,
      }),
    );
    if (!body) {
      return;
    }
    try {
      const created = await apiClient.createS3Credential(activeOrganizationId, body);
      setCreateOpen(false);
      setName('');
      setDescription('');
      setSecret({ accessKeyId: created.accessKeyId, secretAccessKey: created.secretAccessKey });
      await refresh();
    } catch (caught) {
      catchError(caught);
    }
  };

  const handleRevoke = async (credentialId: string) => {
    if (!activeOrganizationId) {
      return;
    }
    try {
      await apiClient.revokeS3Credential(activeOrganizationId, credentialId);
      await refresh();
    } catch (caught) {
      catchError(caught);
    }
  };

  const handleRotate = async (credentialId: string) => {
    if (!activeOrganizationId) {
      return;
    }
    try {
      const rotated = await apiClient.rotateS3Credential(activeOrganizationId, credentialId);
      setSecret({ accessKeyId: rotated.accessKeyId, secretAccessKey: rotated.secretAccessKey });
      await refresh();
    } catch (caught) {
      catchError(caught);
    }
  };

  const openEdit = (credential: PublicS3AccessCredential) => {
    setEditCredential(credential);
    setEditPermissions([...credential.permissions]);
    setAllowedBuckets(credential.allowedBucketNames.join(', '));
    setExpiresAt(credential.expiresAt ? credential.expiresAt.slice(0, 16) : '');
  };

  const handleUpdateCredential = async () => {
    if (!activeOrganizationId || !editCredential) {
      return;
    }
    const body = validate(
      parseForm(updateS3CredentialBodySchema, {
        permissions: editPermissions,
        allowedBucketNames: allowedBuckets
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      }),
    );
    if (!body) {
      return;
    }
    try {
      await apiClient.updateS3Credential(activeOrganizationId, editCredential.id, body);
      setEditCredential(null);
      await refresh();
    } catch (caught) {
      catchError(caught);
    }
  };

  const handleToggleAccount = async (account: PublicServiceAccount) => {
    if (!activeOrganizationId) {
      return;
    }
    try {
      await apiClient.updateServiceAccount(activeOrganizationId, account.id, {
        disabled: !account.disabled,
      });
      await refresh();
    } catch (caught) {
      catchError(caught);
    }
  };

  if (!manage) {
    return (
      <p className="text-sm text-slate-600">Service accounts require users.manage permission.</p>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service accounts"
        description="SigV4 credentials for the S3 gateway. Secret keys are shown once."
        icon={<Bot className="h-5 w-5" aria-hidden="true" />}
        actions={
          <Button type="button" onClick={() => setCreateOpen(true)}>
            Create credential
          </Button>
        }
      />

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {secret ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            <p className="text-sm font-medium text-slate-900">
              Copy these S3 credentials now. The secret will not be shown again.
            </p>
            <p className="text-sm text-slate-600">
              Access key: <code className="rounded bg-slate-100 px-1">{secret.accessKeyId}</code>
            </p>
            <code className="block break-all rounded-md bg-slate-100 px-3 py-2 text-sm">
              {secret.secretAccessKey}
            </code>
            <Button type="button" size="sm" variant="outline" onClick={() => setSecret(null)}>
              Dismiss
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {accounts.length === 0 && credentials.length === 0 ? (
        <EmptyState
          title="No service accounts"
          description="Create a credential for CI, rclone, or the AWS SDK."
        />
      ) : (
        <>
          {accounts.length > 0 ? (
            <Card>
              <CardContent className="overflow-x-auto p-0">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Account</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((account) => (
                      <tr key={account.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900">{account.name}</p>
                          {account.description ? (
                            <p className="text-slate-500">{account.description}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={account.disabled ? 'bg-red-50 text-red-700' : undefined}>
                            {account.disabled ? 'Disabled' : 'Active'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void handleToggleAccount(account)}
                          >
                            {account.disabled ? 'Enable' : 'Disable'}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Access key</th>
                    <th className="px-4 py-3 font-medium">Account</th>
                    <th className="px-4 py-3 font-medium">Last used</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {credentials.map((credential) => (
                    <tr key={credential.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 font-mono text-slate-900">{credential.accessKeyId}</td>
                      <td className="px-4 py-3 text-slate-600">{credential.serviceAccountName}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {credential.lastUsedAt ? formatDate(credential.lastUsedAt) : 'Never'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={credential.revokedAt ? 'bg-red-50 text-red-700' : undefined}>
                          {credential.revokedAt ? 'Revoked' : 'Active'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {credential.revokedAt ? null : (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => openEdit(credential)}
                            >
                              Edit
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => void handleRotate(credential.id)}
                            >
                              Rotate
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => void handleRevoke(credential.id)}
                            >
                              Revoke
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Create S3 credential"
        description="A service account is created with this name if it does not already exist."
        footer={
          <DialogActions
            confirmLabel="Create"
            confirmDisabled={!name.trim() || selectedPermissions.length === 0}
            onCancel={() => setCreateOpen(false)}
            onConfirm={() => void handleCreate()}
          />
        }
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="sa-name">Service account name</Label>
            <Input
              id="sa-name"
              value={name}
              aria-invalid={Boolean(fieldErrors.serviceAccountName)}
              onChange={(event) => setName(event.target.value)}
            />
            <FieldError message={fieldErrors.serviceAccountName} />
          </div>
          <div>
            <Label htmlFor="sa-description">Description</Label>
            <Input
              id="sa-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-700">Permissions</legend>
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-slate-200 p-3">
              {S3_PERMISSIONS.map((permission) => (
                <label key={permission} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedPermissions.includes(permission)}
                    onChange={() => togglePermission(permission)}
                  />
                  {permission}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(editCredential)}
        onOpenChange={(open) => {
          if (!open) {
            setEditCredential(null);
          }
        }}
        title="Edit S3 credential"
        description={editCredential ? editCredential.accessKeyId : undefined}
        footer={
          <DialogActions
            confirmLabel="Save"
            confirmDisabled={editPermissions.length === 0}
            onCancel={() => setEditCredential(null)}
            onConfirm={() => void handleUpdateCredential()}
          />
        }
      >
        <div className="space-y-3">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-700">Permissions</legend>
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-slate-200 p-3">
              {S3_PERMISSIONS.map((permission) => (
                <label key={permission} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editPermissions.includes(permission)}
                    onChange={() =>
                      setEditPermissions((current) =>
                        current.includes(permission)
                          ? current.filter((item) => item !== permission)
                          : [...current, permission],
                      )
                    }
                  />
                  {permission}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <Label htmlFor="sa-buckets">Allowed buckets (comma-separated)</Label>
            <Input
              id="sa-buckets"
              value={allowedBuckets}
              aria-invalid={Boolean(fieldErrors.allowedBucketNames)}
              onChange={(event) => setAllowedBuckets(event.target.value)}
            />
            <FieldError message={fieldErrors.allowedBucketNames} />
          </div>
          <div>
            <Label htmlFor="sa-expires">Expires</Label>
            <Input
              id="sa-expires"
              type="datetime-local"
              value={expiresAt}
              aria-invalid={Boolean(fieldErrors.expiresAt)}
              onChange={(event) => setExpiresAt(event.target.value)}
            />
            <FieldError message={fieldErrors.expiresAt} />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
