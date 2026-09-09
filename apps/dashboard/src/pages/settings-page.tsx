import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FieldError,
  Input,
  Label,
} from '@vaultstack/ui';
import {
  createOrganizationBodySchema,
  parseForm,
  updateOrganizationBodySchema,
  updateUserBodySchema,
} from '@vaultstack/validation';
import { useAuth } from '../context/auth-context.js';
import { apiClient } from '../lib/api.js';
import { canManageAccess } from '../lib/dashboard-permissions.js';
import { useFormSubmit } from '../lib/form-errors.js';
import { TwoFactorSettings } from './two-factor-settings.js';

export function SettingsPage() {
  const {
    user,
    organizations,
    memberships,
    activeOrganizationId,
    permissions,
    refresh,
    selectOrganization,
  } = useAuth();
  const manage = canManageAccess(permissions);
  const { fieldErrors, validate, catchError, toastSuccess } = useFormSubmit();
  const organization = organizations.find((item) => item.id === activeOrganizationId);
  const membership = memberships.find((item) => item.organizationId === activeOrganizationId);
  const [orgName, setOrgName] = useState(organization?.name ?? '');
  const [newOrgName, setNewOrgName] = useState('');
  const [profileName, setProfileName] = useState(user?.name ?? '');
  const [password, setPassword] = useState('');

  useEffect(() => {
    setOrgName(organization?.name ?? '');
  }, [organization?.name]);

  useEffect(() => {
    setProfileName(user?.name ?? '');
  }, [user?.name]);

  const rolesLabel = useMemo(() => membership?.roles.join(', ') ?? 'None', [membership?.roles]);

  const handleRename = async () => {
    if (!activeOrganizationId) {
      return;
    }
    const body = validate(parseForm(updateOrganizationBodySchema, { name: orgName }));
    if (!body) {
      return;
    }
    try {
      await apiClient.updateOrganization(activeOrganizationId, body.name);
      await refresh();
      toastSuccess('Organization name updated.');
    } catch (caught) {
      catchError(caught);
    }
  };

  const handleCreateOrganization = async () => {
    const body = validate(parseForm(createOrganizationBodySchema, { name: newOrgName }));
    if (!body) {
      return;
    }
    try {
      const created = await apiClient.createOrganization(body.name);
      setNewOrgName('');
      await selectOrganization(created.id);
      toastSuccess(`Created organization ${created.name}.`);
    } catch (caught) {
      catchError(caught);
    }
  };

  const handleProfile = async () => {
    if (!activeOrganizationId || !user) {
      return;
    }
    const body = validate(
      parseForm(updateUserBodySchema, {
        name: profileName,
        password: password.trim() ? password : undefined,
      }),
    );
    if (!body) {
      return;
    }
    try {
      await apiClient.updateUser(activeOrganizationId, user.id, body);
      setPassword('');
      await refresh();
      toastSuccess('Profile updated.');
    } catch (caught) {
      catchError(caught);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Settings</h2>
        <p className="text-sm text-slate-500">
          Your account, two-factor authentication, and organization profile.
        </p>
      </div>

      <TwoFactorSettings />

      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
          <CardDescription>
            Slug is assigned at creation and used in URLs. Domain and TLS settings live in the
            deployment environment, not this screen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Slug</Label>
            <Input value={organization?.slug ?? ''} readOnly />
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-name">Name</Label>
            <Input
              id="org-name"
              value={orgName}
              disabled={!manage}
              aria-invalid={Boolean(fieldErrors.name)}
              onChange={(event) => {
                setOrgName(event.target.value);
              }}
            />
            <FieldError message={fieldErrors.name} />
          </div>
          {manage ? (
            <Button type="button" onClick={() => void handleRename()}>
              Save organization
            </Button>
          ) : (
            <p className="text-sm text-slate-500">Renaming requires users.manage.</p>
          )}
        </CardContent>
      </Card>

      {manage ? (
        <Card>
          <CardHeader>
            <CardTitle>New organization</CardTitle>
            <CardDescription>You become SUPER_ADMIN of organizations you create.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="w-full min-w-0 flex-1 space-y-2">
              <Label htmlFor="new-org-name">Name</Label>
              <Input
                id="new-org-name"
                value={newOrgName}
                aria-invalid={Boolean(fieldErrors.name)}
                onChange={(event) => {
                  setNewOrgName(event.target.value);
                }}
              />
              <FieldError message={fieldErrors.name} />
            </div>
            <Button type="button" onClick={() => void handleCreateOrganization()}>
              Create
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Your profile</CardTitle>
          <CardDescription>
            Signed in as {user?.email}. Roles in this organization: {rolesLabel}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="profile-name">Name</Label>
            <Input
              id="profile-name"
              value={profileName}
              disabled={!manage}
              aria-invalid={Boolean(fieldErrors.name)}
              onChange={(event) => {
                setProfileName(event.target.value);
              }}
            />
            <FieldError message={fieldErrors.name} />
          </div>
          {manage ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="profile-password">New password (optional)</Label>
                <Input
                  id="profile-password"
                  type="password"
                  value={password}
                  aria-invalid={Boolean(fieldErrors.password)}
                  onChange={(event) => {
                    setPassword(event.target.value);
                  }}
                />
                <FieldError message={fieldErrors.password} />
                <p className="text-xs text-slate-500">
                  At least 10 characters with a letter and a number.
                </p>
              </div>
              <Button type="button" onClick={() => void handleProfile()}>
                Save profile
              </Button>
            </>
          ) : (
            <p className="text-sm text-slate-500">
              Profile changes require users.manage. Ask an administrator to update your name or
              password.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
