import { NavLink } from 'react-router-dom';
import { SectionShell } from '../../components/section-shell.js';
import { sectionNavClass } from '../../lib/section-nav.js';
import { useAuth } from '../../context/auth-context.js';
import { canManageAccess, canReadAccess } from '../../lib/dashboard-permissions.js';

export function AccessLayout() {
  const { permissions } = useAuth();
  const manage = canManageAccess(permissions);

  if (!canReadAccess(permissions)) {
    return (
      <p className="text-sm text-vs-shade-600">Your account does not have users.read permission.</p>
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
    <SectionShell
      label="Access navigation"
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
