import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '@vaultstack/ui';
import { useAuth } from '../../context/auth-context.js';
import { canManageAccess, canReadAccess } from '../../lib/dashboard-permissions.js';

export function AccessLayout() {
  const { permissions } = useAuth();
  const manage = canManageAccess(permissions);

  if (!canReadAccess(permissions)) {
    return (
      <p className="text-sm text-slate-600">
        Your account does not have users.read permission.
      </p>
    );
  }

  const navItems: { to: string; label: string; end?: boolean }[] = [
    { to: '/access', label: 'Users', end: true },
    { to: '/access/roles', label: 'Roles' },
    { to: '/access/teams', label: 'Teams' },
    ...(manage
      ? [
          { to: '/access/api-keys', label: 'API keys' },
          { to: '/access/service-accounts', label: 'Service accounts' },
        ]
      : []),
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <aside aria-label="Access navigation" className="space-y-2">
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
  );
}
