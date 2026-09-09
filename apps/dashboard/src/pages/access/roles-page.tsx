import { useCallback, useEffect, useState } from 'react';
import type { PublicPermission, PublicRole } from '@vaultstack/types';
import { Badge, Button, Card, CardContent, Dialog, DialogActions, EmptyState, FieldError, Input, Label } from '@vaultstack/ui';
import { createRoleBodySchema, parseForm } from '@vaultstack/validation';
import { useAuth } from '../../context/auth-context.js';
import { apiClient } from '../../lib/api.js';
import { canManageAccess } from '../../lib/dashboard-permissions.js';
import { useFormSubmit } from '../../lib/form-errors.js';

export function RolesPage() {
  const { activeOrganizationId, permissions } = useAuth();
  const manage = canManageAccess(permissions);
  const { fieldErrors, validate, catchError } = useFormSubmit();
  const [roles, setRoles] = useState<PublicRole[]>([]);
  const [catalog, setCatalog] = useState<PublicPermission[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    if (!activeOrganizationId) {
      return;
    }
    try {
      const [nextRoles, nextCatalog] = await Promise.all([
        apiClient.listRoles(activeOrganizationId),
        apiClient.listPermissions(),
      ]);
      setRoles(nextRoles);
      setCatalog(nextCatalog);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load roles');
    }
  }, [activeOrganizationId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const togglePermission = (key: string) => {
    setSelected((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  };

  const handleCreate = async () => {
    if (!activeOrganizationId) {
      return;
    }
    const body = validate(
      parseForm(createRoleBodySchema, {
        name: name.trim(),
        description: description.trim() || undefined,
        permissions: selected,
      }),
    );
    if (!body) {
      return;
    }
    try {
      await apiClient.createRole(activeOrganizationId, body);
      setCreateOpen(false);
      setName('');
      setDescription('');
      setSelected([]);
      await refresh();
    } catch (caught) {
      catchError(caught);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Roles</h2>
          <p className="text-sm text-slate-500">
            System roles are built in. Custom roles can only grant permissions you already have.
          </p>
        </div>
        {manage ? (
          <Button
            type="button"
            onClick={() => {
              setCreateOpen(true);
              setSelected([]);
            }}
          >
            Create role
          </Button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {roles.length === 0 ? (
        <EmptyState title="No roles" description="Roles appear after the organization is provisioned." />
      ) : (
        <div className="grid gap-4">
          {roles.map((role) => (
            <Card key={role.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold text-slate-900">{role.name}</h3>
                  {role.isSystem ? <Badge>System</Badge> : <Badge>Custom</Badge>}
                </div>
                {role.description ? (
                  <p className="text-sm text-slate-500">{role.description}</p>
                ) : null}
                <div className="flex flex-wrap gap-1">
                  {role.permissions.map((permission) => (
                    <Badge key={permission}>{permission}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Create role"
        description="Choose a unique name. System role names such as ADMIN are reserved."
        footer={
          <DialogActions
            confirmLabel="Create"
            confirmDisabled={!name.trim() || selected.length === 0}
            onCancel={() => setCreateOpen(false)}
            onConfirm={() => void handleCreate()}
          />
        }
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="role-name">Name</Label>
            <Input
              id="role-name"
              value={name}
              aria-invalid={Boolean(fieldErrors.name)}
              onChange={(event) => setName(event.target.value)}
            />
            <FieldError message={fieldErrors.name} />
          </div>
          <div>
            <Label htmlFor="role-description">Description</Label>
            <Input
              id="role-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-700">Permissions</legend>
            <FieldError message={fieldErrors.permissions} />
            <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border border-slate-200 p-3">
              {catalog.map((permission) => (
                <label key={permission.id} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.includes(permission.key)}
                    onChange={() => togglePermission(permission.key)}
                  />
                  <span>
                    <span className="font-medium text-slate-800">{permission.key}</span>
                    <span className="block text-slate-500">{permission.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </Dialog>
    </div>
  );
}
