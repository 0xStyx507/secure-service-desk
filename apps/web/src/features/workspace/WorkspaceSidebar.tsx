import type { ReactNode } from 'react';
import { GridIcon, LogoutIcon, ShieldIcon, TicketIcon } from '../../components/Icons';
import { initials, roleLabel } from '../../lib/format';
import type { CurrentUser, Paginated, Ticket } from '../../types';
import type { WorkspaceShellProps } from './WorkspaceShell';

type View = WorkspaceShellProps['view'];

export function WorkspaceSidebar({
  user,
  view,
  tickets,
  onViewChange,
  onLogout,
}: Pick<WorkspaceShellProps, 'user' | 'view' | 'tickets' | 'onViewChange' | 'onLogout'>) {
  const role = user.roles.includes('ADMIN')
    ? 'ADMIN'
    : user.roles.includes('SUPPORT')
      ? 'SUPPORT'
      : 'USER';
  return (
    <aside className="sidebar">
      <SidebarBrand />
      <SidebarNavigation
        view={view}
        tickets={tickets}
        canUseMcp={user.roles.some((item) => item === 'ADMIN' || item === 'SUPPORT')}
        onViewChange={onViewChange}
      />
      <SidebarSecurity />
      <SidebarUser user={user} role={role} onLogout={onLogout} />
    </aside>
  );
}

function SidebarBrand() {
  return (
    <a className="brand" href="/" aria-label="Secure Service Desk">
      <span className="brand__mark">
        <ShieldIcon aria-hidden="true" />
      </span>
      <span>
        <strong>Secure</strong>
        <small>Service Desk</small>
      </span>
    </a>
  );
}

function SidebarNavigation({
  view,
  tickets,
  canUseMcp,
  onViewChange,
}: {
  view: View;
  tickets: Paginated<Ticket>;
  canUseMcp: boolean;
  onViewChange: (view: View) => void;
}) {
  return (
    <nav className="nav" aria-label="Navegación principal">
      <p>WORKSPACE</p>
      <NavButton
        active={view === 'overview'}
        onClick={() => onViewChange('overview')}
        icon={<GridIcon aria-hidden="true" />}
      >
        Resumen
      </NavButton>
      <NavButton
        active={view === 'tickets'}
        onClick={() => onViewChange('tickets')}
        icon={<TicketIcon aria-hidden="true" />}
        count={tickets.pagination.total}
      >
        Tickets
      </NavButton>
      {canUseMcp && (
        <NavButton
          active={view === 'mcp'}
          onClick={() => onViewChange('mcp')}
          icon={<ShieldIcon aria-hidden="true" />}
        >
          MCP Console
        </NavButton>
      )}
      <NavButton
        active={view === 'security'}
        onClick={() => onViewChange('security')}
        icon={<ShieldIcon aria-hidden="true" />}
      >
        Seguridad
      </NavButton>
    </nav>
  );
}

function SidebarSecurity() {
  return (
    <div className="sidebar__security">
      <ShieldIcon aria-hidden="true" />
      <div>
        <strong>Sesión protegida</strong>
        <span>JWT · HttpOnly · CSRF</span>
      </div>
    </div>
  );
}

function SidebarUser({
  user,
  role,
  onLogout,
}: {
  user: CurrentUser;
  role: keyof typeof roleLabel;
  onLogout: () => Promise<void>;
}) {
  return (
    <div className="user-block">
      <span className="avatar">{initials(user.email)}</span>
      <div>
        <strong>{user.email}</strong>
        <span>{roleLabel[role]}</span>
      </div>
      <button onClick={() => void onLogout()} aria-label="Cerrar sesión">
        <LogoutIcon />
      </button>
    </div>
  );
}

function NavButton({
  active,
  onClick,
  icon,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  count?: number;
  children: string;
}) {
  return (
    <button className={active ? 'active' : ''} onClick={onClick}>
      {icon}
      {children}
      {count !== undefined && <span className="nav-count">{count}</span>}
    </button>
  );
}
