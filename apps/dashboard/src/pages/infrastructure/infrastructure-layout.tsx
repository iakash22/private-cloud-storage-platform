import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '@vaultstack/ui';
import { useAuth } from '../../context/auth-context.js';
import { canReadInfrastructure } from '../../lib/infrastructure-permissions.js';

const navItems: { to: string; label: string; end?: boolean }[] = [
  { to: '/infrastructure', label: 'Overview', end: true },
  { to: '/infrastructure/server', label: 'Server' },
  { to: '/infrastructure/disks', label: 'Disks' },
  { to: '/infrastructure/storage', label: 'Storage' },
  { to: '/infrastructure/docker', label: 'Docker' },
];

export function InfrastructureLayout() {
  const { permissions } = useAuth();

  if (!canReadInfrastructure(permissions)) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl items-center px-6 py-12">
        <p className="text-sm text-slate-600">
          Your account does not have infrastructure.read permission.
        </p>
      </main>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <aside aria-label="Infrastructure navigation" className="space-y-2">
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
