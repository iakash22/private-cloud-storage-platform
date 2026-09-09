import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '@vaultstack/ui';

const navItems: { to: string; label: string; end?: boolean }[] = [
  { to: '/artifacts', label: 'Projects', end: true },
];

export function ArtifactsLayout() {
  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <aside aria-label="Artifact navigation" className="space-y-2">
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
