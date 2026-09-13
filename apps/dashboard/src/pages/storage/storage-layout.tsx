import { NavLink } from 'react-router-dom';
import {
  BookOpen,
  Database,
  FileBox,
  FolderOpen,
  HardDrive,
  UsersRound,
  ScrollText,
  Share2,
  Trash2,
} from 'lucide-react';
import { SectionShell } from '../../components/section-shell.js';
import { sectionNavClass } from '../../lib/section-nav.js';

const navItems: {
  to: string;
  label: string;
  icon: typeof HardDrive;
  end?: boolean;
}[] = [
  { to: '/storage', label: 'Overview', icon: HardDrive, end: true },
  { to: '/storage/files', label: 'Files', icon: FolderOpen },
  { to: '/storage/buckets', label: 'Buckets', icon: Database },
  { to: '/storage/providers', label: 'Providers', icon: FileBox },
  { to: '/storage/shares', label: 'Shares', icon: Share2 },
  { to: '/storage/policies', label: 'Policies', icon: ScrollText },
  { to: '/storage/collaboration', label: 'Collaboration', icon: UsersRound },
  { to: '/storage/usage', label: 'Usage', icon: BookOpen },
  { to: '/storage/trash', label: 'Trash', icon: Trash2 },
];

export function StorageLayout() {
  return (
    <SectionShell
      label="Storage navigation"
      nav={navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => sectionNavClass(isActive)}
        >
          <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          {item.label}
        </NavLink>
      ))}
    />
  );
}
