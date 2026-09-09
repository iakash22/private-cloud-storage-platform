import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '@vaultstack/ui';

const navItems: {
  to: string;
  label: string;
  end?: boolean;
}[] = [
  { to: '/storage', label: 'Overview', end: true },
  { to: '/storage/files', label: 'Files' },
  { to: '/storage/buckets', label: 'Buckets' },
  { to: '/storage/providers', label: 'Providers' },
  { to: '/storage/shares', label: 'Shares' },
  { to: '/storage/usage', label: 'Usage' },
  { to: '/storage/trash', label: 'Trash' },
];

export function StorageLayout() {
  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
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
  );
}
