import { useCallback, useEffect, useState } from 'react';
import type { PublicRole, PublicUser } from '@vaultstack/types';
import {
  Badge,
  Button,
  Card,
  CardContent,
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
import { Users } from 'lucide-react';
import { createUserBodySchema, parseForm } from '@vaultstack/validation';
import { useAuth } from '../../context/auth-context.js';
import { apiClient } from '../../lib/api.js';
import { canManageAccess } from '../../lib/dashboard-permissions.js';
import { useFormSubmit } from '../../lib/form-errors.js';

export function UsersPage() {
  const { activeOrganizationId, permissions, user: currentUser } = useAuth();
  const manage = canManageAccess(permissions);
  const { fieldErrors, validate, catchError, clearFieldErrors } = useFormSubmit();
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [roles, setRoles] = useState<PublicRole[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [assignUser, setAssignUser] = useState<PublicUser | null>(null);
  const [removeUser, setRemoveUser] = useState<PublicUser | null>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState('');
  const [assignRoleId, setAssignRoleId] = useState('');

  const refresh = useCallback(async () => {
    if (!activeOrganizationId) {
      return;
    }
    try {
      const [nextUsers, nextRoles] = await Promise.all([
        apiClient.listUsers(activeOrganizationId),
        apiClient.listRoles(activeOrganizationId),
      ]);
      setUsers(nextUsers);
      setRoles(nextRoles);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load users');
    }
  }, [activeOrganizationId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!roleId && roles[0]) {
      setRoleId(roles[0].id);
    }
  }, [roleId, roles]);

  const handleCreate = async () => {
    if (!activeOrganizationId) {
      return;
    }
    const body = validate(
      parseForm(createUserBodySchema, {
        email,
        name,
        password,
        roleId: roleId || undefined,
      }),
    );
    if (!body) {
      return;
    }
    try {
      await apiClient.createUser(activeOrganizationId, body);
      setCreateOpen(false);
      setEmail('');
      setName('');
      setPassword('');
      clearFieldErrors();
      await refresh();
    } catch (caught) {
      catchError(caught);
    }
  };

  const handleDisable = async (user: PublicUser, disabled: boolean) => {
    if (!activeOrganizationId) {
      return;
    }
    try {
      await apiClient.updateUser(activeOrganizationId, user.id, { disabled });
      await refresh();
    } catch (caught) {
      catchError(caught);
    }
  };

  const handleAssign = async () => {
    if (!activeOrganizationId || !assignUser || !assignRoleId) {
      return;
    }
    try {
      await apiClient.assignRole(activeOrganizationId, assignUser.id, assignRoleId);
      setAssignUser(null);
      await refresh();
    } catch (caught) {
      catchError(caught);
    }
  };

  const handleRemoveRole = async () => {
    if (!activeOrganizationId || !removeUser || !assignRoleId) {
      return;
    }
    try {
      await apiClient.removeRole(activeOrganizationId, removeUser.id, assignRoleId);
      setRemoveUser(null);
      await refresh();
    } catch (caught) {
      catchError(caught);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Organization members and their account status."
        icon={<Users className="h-5 w-5" aria-hidden="true" />}
        actions={
          manage ? (
            <Button type="button" onClick={() => setCreateOpen(true)}>
              Invite user
            </Button>
          ) : null
        }
      />

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {users.length === 0 ? (
        <EmptyState
          title="No users yet"
          description="Invite a teammate to this organization."
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  {manage ? <th className="px-4 py-3 font-medium">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-slate-900">{user.name}</td>
                    <td className="px-4 py-3 text-slate-600">{user.email}</td>
                    <td className="px-4 py-3">
                      <Badge className={user.disabled ? 'bg-red-50 text-red-700' : undefined}>
                        {user.disabled ? 'Disabled' : 'Active'}
                      </Badge>
                    </td>
                    {manage ? (
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setAssignUser(user);
                              setAssignRoleId(roles[0]?.id ?? '');
                            }}
                          >
                            Assign role
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setRemoveUser(user);
                              setAssignRoleId(roles[0]?.id ?? '');
                            }}
                          >
                            Remove role
                          </Button>
                          {user.id !== currentUser?.id ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => void handleDisable(user, !user.disabled)}
                            >
                              {user.disabled ? 'Enable' : 'Disable'}
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
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
        title="Invite user"
        description="Creates a login for this organization. Passwords must be at least 10 characters with a letter and a number."
        footer={
          <DialogActions
            confirmLabel="Create"
            confirmDisabled={false}
            onCancel={() => setCreateOpen(false)}
            onConfirm={() => void handleCreate()}
          />
        }
      >
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="user-name">Name</Label>
            <Input
              id="user-name"
              value={name}
              aria-invalid={Boolean(fieldErrors.name)}
              onChange={(event) => setName(event.target.value)}
            />
            <FieldError message={fieldErrors.name} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="user-email">Email</Label>
            <Input
              id="user-email"
              type="email"
              value={email}
              aria-invalid={Boolean(fieldErrors.email)}
              onChange={(event) => setEmail(event.target.value)}
            />
            <FieldError message={fieldErrors.email} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="user-password">Password</Label>
            <PasswordInput
              id="user-password"
              autoComplete="new-password"
              value={password}
              aria-invalid={Boolean(fieldErrors.password)}
              onChange={(event) => setPassword(event.target.value)}
            />
            <FieldError message={fieldErrors.password} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="user-role">Role</Label>
            <Select
              id="user-role"
              aria-label="Role"
              value={roleId}
              onChange={setRoleId}
              aria-invalid={Boolean(fieldErrors.roleId)}
              options={roles.map((role) => ({ value: role.id, label: role.name }))}
            />
            <FieldError message={fieldErrors.roleId} />
          </div>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(assignUser)}
        onOpenChange={(open) => {
          if (!open) {
            setAssignUser(null);
          }
        }}
        title="Assign role"
        description={assignUser ? `Grant an additional role to ${assignUser.email}.` : undefined}
        footer={
          <DialogActions
            confirmLabel="Assign"
            confirmDisabled={!assignRoleId}
            onCancel={() => setAssignUser(null)}
            onConfirm={() => void handleAssign()}
          />
        }
      >
        <div>
          <Label htmlFor="assign-role">Role</Label>
          <Select
            id="assign-role"
            aria-label="Role"
            value={assignRoleId}
            onChange={setAssignRoleId}
            options={roles.map((role) => ({ value: role.id, label: role.name }))}
          />
        </div>
      </Dialog>

      <Dialog
        open={Boolean(removeUser)}
        onOpenChange={(open) => {
          if (!open) {
            setRemoveUser(null);
          }
        }}
        title="Remove role"
        description={removeUser ? `Remove a role from ${removeUser.email}.` : undefined}
        footer={
          <DialogActions
            confirmLabel="Remove"
            confirmDisabled={!assignRoleId}
            onCancel={() => setRemoveUser(null)}
            onConfirm={() => void handleRemoveRole()}
          />
        }
      >
        <div>
          <Label htmlFor="remove-role">Role</Label>
          <Select
            id="remove-role"
            aria-label="Role"
            value={assignRoleId}
            onChange={setAssignRoleId}
            options={roles.map((role) => ({ value: role.id, label: role.name }))}
          />
        </div>
      </Dialog>
    </div>
  );
}
