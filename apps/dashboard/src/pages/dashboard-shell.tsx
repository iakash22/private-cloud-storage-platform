import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Button, cn } from '@vaultstack/ui';
import { useAuth } from '../context/auth-context.js';
import { canReadBackups } from '../lib/backup-permissions.js';
import {
  canReadAccess,
  canReadActivity,
  canReadArtifacts,
  canReadSettings,
} from '../lib/dashboard-permissions.js';
import { canReadInfrastructure } from '../lib/infrastructure-permissions.js';
import { canReadStorage } from '../lib/storage-preferences.js';

interface NavigationItem {
  to: string;
  label: string;
  visible: boolean;
  end?: boolean;
}

export function DashboardShell() {
  const { user, organizations, activeOrganizationId, permissions, logout, selectOrganization } =
    useAuth();
  const navigate = useNavigate();
  const navigation: NavigationItem[] = [
    { to: '/', label: 'Dashboard', visible: true, end: true },
    { to: '/storage', label: 'Storage', visible: canReadStorage(permissions) },
    { to: '/artifacts', label: 'Artifacts', visible: canReadArtifacts(permissions) },
    { to: '/backups', label: 'Backups', visible: canReadBackups(permissions) },
    {
      to: '/infrastructure',
      label: 'Infrastructure',
      visible: canReadInfrastructure(permissions),
    },
    { to: '/access', label: 'Access', visible: canReadAccess(permissions) },
    { to: '/activity', label: 'Activity', visible: canReadActivity(permissions) },
    { to: '/settings', label: 'Settings', visible: canReadSettings(permissions) },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <button
              type="button"
              className="text-left"
              aria-label="Open dashboard"
              onClick={() => void navigate('/')}
            >
              <p className="text-xs uppercase tracking-wide text-slate-500">VaultStack</p>
              <p className="text-lg font-semibold text-slate-900">Private cloud control plane</p>
            </button>
            <div className="flex flex-wrap items-center justify-end gap-3">
              {organizations.length > 1 ? (
                <select
                  aria-label="Active organization"
                  className="h-10 max-w-[14rem] rounded-md border border-slate-200 bg-white px-3 text-sm"
                  value={activeOrganizationId ?? ''}
                  onChange={(event) => {
                    void selectOrganization(event.target.value);
                  }}
                >
                  {organizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name}
                    </option>
                  ))}
                </select>
              ) : null}
              <span className="hidden text-sm text-slate-600 sm:inline">{user?.email}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Log out"
                onClick={() => {
                  void logout().then(() => {
                    void navigate('/login');
                  });
                }}
              >
                Log out
              </Button>
            </div>
          </div>
          <nav aria-label="Primary navigation" className="mt-4 overflow-x-auto">
            <div className="flex min-w-max gap-1">
              {navigation
                .filter((item) => item.visible)
                .map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cn(
                        'rounded-md px-3 py-2 text-sm font-medium transition',
                        isActive
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
            </div>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
