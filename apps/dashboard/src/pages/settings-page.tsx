import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FormField,
  Input,
  Label,
  PageHeader,
} from '@vaultstack/ui';
import { Building2, KeyRound, Settings, Shield, UserRound } from 'lucide-react';
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

function SettingsSection({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 px-0.5">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate-900 text-white">
          {icon}
        </span>
        <h2 className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          {label}
        </h2>
      </div>
      {children}
    </section>
  );
}

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
  const orgForm = useFormSubmit();
  const createOrgForm = useFormSubmit();
  const profileForm = useFormSubmit();
  const organization = organizations.find((item) => item.id === activeOrganizationId);
  const membership = memberships.find((item) => item.organizationId === activeOrganizationId);
  const [orgName, setOrgName] = useState(organization?.name ?? '');
  const [newOrgName, setNewOrgName] = useState('');
  const [profileName, setProfileName] = useState(user?.name ?? '');
  const [password, setPassword] = useState('');
  const [savingOrg, setSavingOrg] = useState(false);
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    setOrgName(organization?.name ?? '');
  }, [organization?.name]);

  useEffect(() => {
    setProfileName(user?.name ?? '');
  }, [user?.name]);

  const rolesLabel = useMemo(() => membership?.roles?.join(', ') ?? 'None', [membership?.roles]);
  const orgDirty = orgName.trim() !== (organization?.name ?? '').trim();
  const createOrgReady = newOrgName.trim().length > 0;
  const profileDirty =
    profileName.trim() !== (user?.name ?? '').trim() || password.trim().length > 0;

  const handleRename = async () => {
    if (!activeOrganizationId || !orgDirty) {
      return;
    }
    orgForm.clearFieldErrors();
    const body = orgForm.validate(parseForm(updateOrganizationBodySchema, { name: orgName }));
    if (!body) {
      return;
    }
    setSavingOrg(true);
    try {
      await apiClient.updateOrganization(activeOrganizationId, body.name);
      await refresh({ silent: true });
      orgForm.toastSuccess('Organization name updated.');
    } catch (caught) {
      orgForm.catchError(caught);
    } finally {
      setSavingOrg(false);
    }
  };

  const handleCreateOrganization = async () => {
    if (!createOrgReady) {
      return;
    }
    createOrgForm.clearFieldErrors();
    const body = createOrgForm.validate(
      parseForm(createOrganizationBodySchema, { name: newOrgName }),
    );
    if (!body) {
      return;
    }
    setCreatingOrg(true);
    try {
      const created = await apiClient.createOrganization(body.name);
      setNewOrgName('');
      await selectOrganization(created.id);
      createOrgForm.toastSuccess(`Created organization ${created.name}.`);
    } catch (caught) {
      createOrgForm.catchError(caught);
    } finally {
      setCreatingOrg(false);
    }
  };

  const handleProfile = async () => {
    if (!activeOrganizationId || !user || !profileDirty) {
      return;
    }
    profileForm.clearFieldErrors();
    const body = profileForm.validate(
      parseForm(updateUserBodySchema, {
        name: profileName,
        password: password.trim() ? password : undefined,
      }),
    );
    if (!body) {
      return;
    }
    setSavingProfile(true);
    try {
      await apiClient.updateUser(activeOrganizationId, user.id, body);
      setPassword('');
      await refresh({ silent: true });
      profileForm.toastSuccess('Profile updated.');
    } catch (caught) {
      profileForm.catchError(caught);
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Settings"
        description="Account security, profile, and organization details for this workspace."
        icon={<Settings className="h-5 w-5" aria-hidden="true" />}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Signed in</p>
          <p className="mt-1 truncate font-display text-sm font-semibold text-slate-900">
            {user?.email ?? '—'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Organization</p>
          <p className="mt-1 truncate font-display text-sm font-semibold text-slate-900">
            {organization?.name ?? '—'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Roles</p>
          <p className="mt-1 truncate font-display text-sm font-semibold text-slate-900">{rolesLabel}</p>
        </div>
      </div>

      <SettingsSection icon={<Shield className="h-3.5 w-3.5" aria-hidden="true" />} label="Security">
        <TwoFactorSettings />
      </SettingsSection>

      <SettingsSection
        icon={<Building2 className="h-3.5 w-3.5" aria-hidden="true" />}
        label="Organization"
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Workspace profile</CardTitle>
              <CardDescription>
                Slug is fixed at creation. Domain and TLS are managed in deployment, not here.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField>
                <Label>Slug</Label>
                <Input value={organization?.slug ?? ''} readOnly className="font-mono text-sm" />
              </FormField>
              <FormField error={orgForm.fieldErrors.name}>
                <Label htmlFor="org-name">Name</Label>
                <Input
                  id="org-name"
                  value={orgName}
                  disabled={!manage}
                  aria-invalid={Boolean(orgForm.fieldErrors.name)}
                  onChange={(event) => {
                    setOrgName(event.target.value);
                    if (orgForm.fieldErrors.name) {
                      orgForm.clearFieldErrors();
                    }
                  }}
                />
              </FormField>
              {manage ? (
                <Button
                  type="button"
                  loading={savingOrg}
                  loadingLabel="Saving…"
                  disabled={!orgDirty || savingOrg}
                  onClick={() => void handleRename()}
                >
                  Save organization
                </Button>
              ) : (
                <p className="text-sm text-slate-500">Renaming requires users.manage.</p>
              )}
            </CardContent>
          </Card>

          {manage ? (
            <Card className="h-full">
              <CardHeader>
                <CardTitle>New organization</CardTitle>
                <CardDescription>
                  You become SUPER_ADMIN of organizations you create.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField error={createOrgForm.fieldErrors.name}>
                  <Label htmlFor="new-org-name">Name</Label>
                  <Input
                    id="new-org-name"
                    value={newOrgName}
                    placeholder="Acme Cloud"
                    aria-invalid={Boolean(createOrgForm.fieldErrors.name)}
                    onChange={(event) => {
                      setNewOrgName(event.target.value);
                      if (createOrgForm.fieldErrors.name) {
                        createOrgForm.clearFieldErrors();
                      }
                    }}
                  />
                </FormField>
                <Button
                  type="button"
                  loading={creatingOrg}
                  loadingLabel="Creating…"
                  disabled={!createOrgReady || creatingOrg}
                  onClick={() => void handleCreateOrganization()}
                >
                  Create organization
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="flex h-full items-center justify-center border-dashed bg-slate-50/70">
              <CardContent className="py-8 text-center text-sm text-slate-500">
                Ask an administrator if you need another organization workspace.
              </CardContent>
            </Card>
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        icon={<UserRound className="h-3.5 w-3.5" aria-hidden="true" />}
        label="Profile"
      >
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                {(user?.name ?? user?.email ?? '?').slice(0, 1).toUpperCase()}
              </span>
              <div>
                <CardTitle>Your profile</CardTitle>
                <CardDescription>
                  Signed in as {user?.email ?? 'unknown'}. Roles in this organization: {rolesLabel}.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField error={profileForm.fieldErrors.name}>
                <Label htmlFor="profile-name">Display name</Label>
                <Input
                  id="profile-name"
                  value={profileName}
                  disabled={!manage}
                  aria-invalid={Boolean(profileForm.fieldErrors.name)}
                  onChange={(event) => {
                    setProfileName(event.target.value);
                    if (profileForm.fieldErrors.name) {
                      profileForm.clearFieldErrors();
                    }
                  }}
                />
              </FormField>
              {manage ? (
                <FormField error={profileForm.fieldErrors.password}>
                  <Label htmlFor="profile-password">New password (optional)</Label>
                  <Input
                    id="profile-password"
                    type="password"
                    value={password}
                    aria-invalid={Boolean(profileForm.fieldErrors.password)}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      if (profileForm.fieldErrors.password) {
                        profileForm.clearFieldErrors();
                      }
                    }}
                  />
                  <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-slate-500">
                    <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                    At least 10 characters with a letter and a number.
                  </p>
                </FormField>
              ) : null}
            </div>
            {manage ? (
              <Button
                type="button"
                loading={savingProfile}
                loadingLabel="Saving…"
                disabled={!profileDirty || savingProfile}
                onClick={() => void handleProfile()}
              >
                Save profile
              </Button>
            ) : (
              <p className="text-sm text-slate-500">
                Profile changes require users.manage. Ask an administrator to update your name or
                password.
              </p>
            )}
          </CardContent>
        </Card>
      </SettingsSection>
    </div>
  );
}
