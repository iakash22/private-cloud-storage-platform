import { NavLink } from 'react-router-dom';
import { SectionShell } from '../../components/section-shell.js';
import { sectionNavClass } from '../../lib/section-nav.js';

const navItems: { to: string; label: string; end?: boolean }[] = [
  { to: '/artifacts', label: 'Projects', end: true },
];

export function ArtifactsLayout() {
  return (
    <SectionShell
      label="Artifact navigation"
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
