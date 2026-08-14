import type { FormEvent } from 'react';
import { BellIcon, PlusIcon } from '../../components/Icons';
import { MfaPanel } from '../security/MfaPanel';
import { McpConsole } from '../mcp/McpConsole';
import type { CurrentUser, Notification, Paginated, Ticket, TicketFilters } from '../../types';
import { CreateTicketDialog } from './CreateTicketDialog';
import { NotificationPopover } from './NotificationPopover';
import { Overview } from './Overview';
import { TicketDetail } from './TicketDetail';
import { TicketQueue } from './TicketQueue';
import { WorkspaceSidebar } from './WorkspaceSidebar';

type View = 'overview' | 'tickets' | 'security' | 'mcp';
export interface WorkspaceShellProps {
  user: CurrentUser;
  onLogout: () => Promise<void>;
  view: View;
  onViewChange: (view: View) => void;
  tickets: Paginated<Ticket>;
  filters: TicketFilters;
  searchInput: string;
  loading: boolean;
  error?: string;
  notifications: Notification[];
  notificationsState: 'loading' | 'ready' | 'error';
  notificationsOpen: boolean;
  onToggleNotifications: () => void;
  onCloseNotifications: () => void;
  onRetryNotifications: () => Promise<void>;
  onReadNotification: (notification: Notification) => Promise<void>;
  stats: { total: number; active: number; waiting: number; critical: number };
  onSearchInput: (value: string) => void;
  onSearch: (event: FormEvent<HTMLFormElement>) => void;
  onFilters: (filters: TicketFilters) => void;
  onOpenTicket: (ticket: Ticket) => void;
  createOpen: boolean;
  onCreate: () => void;
  onCloseCreate: () => void;
  onCreated: (ticket: Ticket) => Promise<void>;
  selectedTicket?: Ticket;
  onCloseTicket: () => void;
  onRetryTickets: () => Promise<void>;
}

export function WorkspaceShell(props: WorkspaceShellProps) {
  return (
    <div className="app-shell">
      <WorkspaceSidebar {...props} />
      <main className="workspace">
        <Topbar {...props} />
        <WorkspaceContent {...props} />
      </main>
      <Dialogs {...props} />
    </div>
  );
}

function Topbar(props: WorkspaceShellProps) {
  const title =
    props.view === 'overview'
      ? 'Centro de operaciones'
      : props.view === 'tickets'
        ? 'Cola de tickets'
        : props.view === 'mcp'
          ? 'MCP operations console'
          : 'Seguridad de la cuenta';
  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">SERVICE OPERATIONS</p>
          <h1>{title}</h1>
        </div>
        <div className="topbar__actions">
          <span className="environment">
            <i /> Demo environment
          </span>
          <NotificationButton {...props} />
          {props.notificationsOpen && (
            <NotificationPopover
              notifications={props.notifications}
              state={props.notificationsState}
              onClose={props.onCloseNotifications}
              onRetry={props.onRetryNotifications}
              onRead={props.onReadNotification}
            />
          )}
          <button className="button button--primary" onClick={props.onCreate}>
            <PlusIcon /> Nuevo ticket
          </button>
        </div>
      </header>
      <WorkspaceAlert error={props.error} onRetryTickets={props.onRetryTickets} />
    </>
  );
}

function NotificationButton({
  notifications,
  notificationsOpen,
  onToggleNotifications,
}: Pick<WorkspaceShellProps, 'notifications' | 'notificationsOpen' | 'onToggleNotifications'>) {
  return (
    <button
      className="icon-button"
      aria-label="Notificaciones"
      aria-expanded={notificationsOpen}
      onClick={onToggleNotifications}
    >
      <BellIcon />
      {notifications.some((item) => !item.readAt) && <span className="notification-dot" />}
    </button>
  );
}

function WorkspaceAlert({
  error,
  onRetryTickets: onRetry,
}: Pick<WorkspaceShellProps, 'error' | 'onRetryTickets'>) {
  return error ? (
    <div className="inline-alert" role="alert">
      {error}
      <button onClick={() => void onRetry()}>Reintentar</button>
    </div>
  ) : null;
}

function WorkspaceContent(props: WorkspaceShellProps) {
  if (props.view === 'overview')
    return (
      <Overview
        stats={props.stats}
        tickets={props.tickets.items.slice(0, 5)}
        notifications={props.notifications}
        notificationsState={props.notificationsState}
        loading={props.loading}
        onOpenTicket={props.onOpenTicket}
        onViewAll={() => props.onViewChange('tickets')}
        onCreate={props.onCreate}
        onRetryNotifications={props.onRetryNotifications}
      />
    );
  if (props.view === 'tickets')
    return (
      <TicketQueue
        data={props.tickets}
        filters={props.filters}
        searchInput={props.searchInput}
        loading={props.loading}
        onSearchInput={props.onSearchInput}
        onSearch={props.onSearch}
        onFilters={props.onFilters}
        onOpenTicket={props.onOpenTicket}
      />
    );
  if (props.view === 'mcp') return <McpConsole tickets={props.tickets.items} />;
  return <MfaPanel />;
}

function Dialogs(props: WorkspaceShellProps) {
  return (
    <>
      {props.createOpen && (
        <CreateTicketDialog onClose={props.onCloseCreate} onCreated={props.onCreated} />
      )}
      {props.selectedTicket && (
        <TicketDetail ticket={props.selectedTicket} onClose={props.onCloseTicket} />
      )}
    </>
  );
}
