import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Button, cn } from '@vaultstack/ui';
import { useAuth } from '../../context/auth-context.js';

const navItems: {
  to: string;
  label: string;
  end?: boolean;
}[] = [
  { to: '/storage', label: 'Overview', end: true },
  { to: '/storage/files', label: 'Files' },
  { to: '/storage/buckets', label: 'Buckets' },
  { to: '/storage/shares', label: 'Shares' },
  { to: '/storage/usage', label: 'Usage' },
  { to: '/storage/trash', label: 'Trash' },
];

export function StorageLayout() {
  const { user, organizations, activeOrganizationId, logout, selectOrganization } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">VaultStack</p>
            <h1 className="text-lg font-semibold text-slate-900">Storage Dashboard</h1>
          </div>
          <div className="flex items-center gap-3">
            {organizations.length > 1 ? (
              <select
                aria-label="Active organization"
                className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
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
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[240px_1fr]">
        <aside aria-label="Storage navigation" className="space-y-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center rounded-md px-3 py-2 text-sm font-medium transition',
                  isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </aside>
        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
