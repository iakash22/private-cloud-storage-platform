import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '@vaultstack/ui';

const navItems: { to: string; label: string; end?: boolean }[] = [
  { to: '/backups', label: 'Overview', end: true },
  { to: '/backups/jobs', label: 'Jobs' },
  { to: '/backups/schedules', label: 'Schedules' },
  { to: '/backups/snapshots', label: 'Snapshots' },
  { to: '/backups/restore', label: 'Restore' },
];

export function BackupsLayout() {
  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <aside aria-label="Backup navigation" className="space-y-2">
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
