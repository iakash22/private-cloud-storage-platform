import { NavLink } from 'react-router-dom';
import { SectionShell } from '../../components/section-shell.js';
import { sectionNavClass } from '../../lib/section-nav.js';

const navItems: { to: string; label: string; end?: boolean }[] = [
  { to: '/backups', label: 'Overview', end: true },
  { to: '/backups/jobs', label: 'Jobs' },
  { to: '/backups/schedules', label: 'Schedules' },
  { to: '/backups/snapshots', label: 'Snapshots' },
  { to: '/backups/restore', label: 'Restore' },
];

export function BackupsLayout() {
  return (
    <SectionShell
      label="Backup navigation"
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
