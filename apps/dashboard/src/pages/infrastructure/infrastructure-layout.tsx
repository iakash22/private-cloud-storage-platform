import { NavLink } from 'react-router-dom';
import { SectionShell } from '../../components/section-shell.js';
import { sectionNavClass } from '../../lib/section-nav.js';
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
      <main className="mx-auto flex min-h-[40vh] max-w-3xl items-center px-6 py-12">
        <p className="text-sm text-vs-shade-600">
          Your account does not have infrastructure.read permission.
        </p>
      </main>
    );
  }

  return (
    <SectionShell
      label="Infrastructure navigation"
      nav={navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => sectionNavClass(isActive)}
        >
          {item.label}
        </NavLink>
      ))}
    />
  );
}
