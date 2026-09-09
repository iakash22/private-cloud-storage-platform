import { useCallback, useEffect, useState } from 'react';
import type { PublicApiKey } from '@vaultstack/types';
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
} from '@vaultstack/ui';
import { createApiKeyBodySchema, parseForm } from '@vaultstack/validation';
import { useAuth } from '../../context/auth-context.js';
import { apiClient } from '../../lib/api.js';
import { canManageAccess } from '../../lib/dashboard-permissions.js';
import { useFormSubmit } from '../../lib/form-errors.js';

export function ApiKeysPage() {
  const { activeOrganizationId, permissions } = useAuth();
  const manage = canManageAccess(permissions);
  const { fieldErrors, validate, catchError } = useFormSubmit();
  const [keys, setKeys] = useState<PublicApiKey[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [plaintext, setPlaintext] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!activeOrganizationId) {
      return;
    }
    try {
      setKeys(await apiClient.listApiKeys(activeOrganizationId));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load API keys');
    }
  }, [activeOrganizationId]);

  useEffect(() => {
    if (manage) {
      void refresh();
    }
  }, [manage, refresh]);

  const handleCreate = async () => {
    if (!activeOrganizationId) {
      return;
    }
    const body = validate(
      parseForm(createApiKeyBodySchema, {
        name: name.trim(),
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      }),
    );
    if (!body) {
      return;
    }
    try {
      const created = await apiClient.createApiKey(activeOrganizationId, body);
      setCreateOpen(false);
      setName('');
      setExpiresAt('');
      setPlaintext(created.token);
      await refresh();
    } catch (caught) {
      catchError(caught);
    }
  };

  const handleRevoke = async (apiKeyId: string) => {
    if (!activeOrganizationId) {
      return;
    }
    try {
      await apiClient.revokeApiKey(activeOrganizationId, apiKeyId);
      await refresh();
    } catch (caught) {
      catchError(caught);
    }
  };

  if (!manage) {
    return <p className="text-sm text-slate-600">API keys require users.manage permission.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">API keys</h2>
          <p className="text-sm text-slate-500">
            Bearer tokens for programmatic access. The secret is shown once at creation.
          </p>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          Create API key
        </Button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {plaintext ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            <p className="text-sm font-medium text-slate-900">Copy this token now. It will not be shown again.</p>
            <code className="block break-all rounded-md bg-slate-100 px-3 py-2 text-sm">{plaintext}</code>
            <Button type="button" size="sm" variant="outline" onClick={() => setPlaintext(null)}>
              Dismiss
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {keys.length === 0 ? (
        <EmptyState title="No API keys" description="Create a key to authenticate scripts and CI jobs." />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Prefix</th>
                  <th className="px-4 py-3 font-medium">Last used</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => (
                  <tr key={key.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-slate-900">{key.name}</td>
                    <td className="px-4 py-3 font-mono text-slate-600">{key.prefix}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {key.lastUsedAt ? formatDate(key.lastUsedAt) : 'Never'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={key.revokedAt ? 'bg-red-50 text-red-700' : undefined}>
                        {key.revokedAt ? 'Revoked' : 'Active'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {key.revokedAt ? null : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void handleRevoke(key.id)}
                        >
                          Revoke
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Create API key"
        description="Store the token in a secret manager. VaultStack never returns it again."
        footer={
          <DialogActions
            confirmLabel="Create"
            confirmDisabled={!name.trim()}
            onCancel={() => setCreateOpen(false)}
            onConfirm={() => void handleCreate()}
          />
        }
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="api-key-name">Name</Label>
            <Input
              id="api-key-name"
              value={name}
              aria-invalid={Boolean(fieldErrors.name)}
              onChange={(event) => setName(event.target.value)}
            />
            <FieldError message={fieldErrors.name} />
          </div>
          <div>
            <Label htmlFor="api-key-expires">Expires (optional)</Label>
            <Input
              id="api-key-expires"
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
