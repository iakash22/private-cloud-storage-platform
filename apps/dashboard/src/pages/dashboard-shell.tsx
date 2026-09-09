import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Button, cn } from '@vaultstack/ui';
import { useAuth } from '../context/auth-context.js';
import { canReadBackups } from '../lib/backup-permissions.js';
import { canReadAccess, canReadActivity, canReadArtifacts } from '../lib/dashboard-permissions.js';
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
  const [navOpen, setNavOpen] = useState(false);
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
    { to: '/settings', label: 'Settings', visible: true },
  ];

  return (
    <div className="min-h-[100dvh] min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                className="inline-flex min-h-11 items-center rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700 md:hidden"
                aria-expanded={navOpen}
                aria-controls="primary-navigation"
                onClick={() => {
                  setNavOpen((open) => !open);
                }}
              >
                {navOpen ? 'Close' : 'Menu'}
              </button>
              <button
                type="button"
                className="min-w-0 text-left"
                aria-label="Open dashboard"
                onClick={() => {
                  setNavOpen(false);
                  void navigate('/');
                }}
              >
                <p className="text-xs uppercase tracking-wide text-slate-500">VaultStack</p>
                <p className="truncate text-base font-semibold text-slate-900 sm:text-lg">
                  Private cloud control plane
                </p>
              </button>
            </div>
            <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-3">
              {organizations.length > 1 ? (
                <select
                  aria-label="Active organization"
                  className="h-11 max-w-[9.5rem] rounded-md border border-slate-200 bg-white px-2 text-base sm:max-w-[14rem] sm:px-3 sm:text-sm"
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
              <span className="hidden max-w-[12rem] truncate text-sm text-slate-600 lg:inline">
                {user?.email}
              </span>
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
          <nav
            id="primary-navigation"
            aria-label="Primary navigation"
            className={cn('mt-3 md:mt-4', navOpen ? 'block' : 'hidden md:block')}
          >
            <div className="flex flex-col gap-1 md:flex-row md:flex-wrap md:overflow-x-auto">
              {navigation
                .filter((item) => item.visible)
                .map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => {
                      setNavOpen(false);
                    }}
                    className={({ isActive }) =>
                      cn(
                        'min-h-11 rounded-md px-3 py-2 text-sm font-medium transition md:min-h-0',
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
      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-6">
        <Outlet />
      </main>
    </div>
  );
}
