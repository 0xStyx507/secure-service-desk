import { useState } from 'react';
import { ticketsApi } from '../tickets/api';
import { ticketId } from '../../lib/format';
import type { CurrentUser, Ticket, Notification } from '../../types';
import { useNotifications } from './hooks/useNotifications';
import { useTickets } from './hooks/useTickets';
import type { WorkspaceShellProps } from './WorkspaceShell';

type View = WorkspaceShellProps['view'];
type TicketsState = ReturnType<typeof useTickets>;
type NotificationsState = ReturnType<typeof useNotifications>;

export function useWorkspaceController(
  user: CurrentUser,
  onLogout: () => Promise<void>,
): WorkspaceShellProps {
  const viewState = useWorkspaceViewState();
  const tickets = useTickets();
  const notifications = useNotifications();
  const actions = useWorkspaceActions(viewState, tickets, notifications);
  return {
    user,
    onLogout,
    ...viewState,
    ...actions,
    tickets: tickets.tickets,
    filters: tickets.filters,
    searchInput: tickets.searchInput,
    loading: tickets.loading,
    error: actions.actionError ?? tickets.error,
    notifications: notifications.notifications,
    notificationsState: notifications.state,
    onRetryNotifications: notifications.loadNotifications,
    onReadNotification: actions.markNotificationRead,
    stats: getStats(tickets.tickets.items, tickets.tickets.pagination.total),
    onSearchInput: tickets.setSearchInput,
    onSearch: tickets.search,
    onFilters: tickets.setFilters,
    onRetryTickets: tickets.loadTickets,
  } as WorkspaceShellProps;
}

function useWorkspaceViewState() {
  const [view, setView] = useState<View>('overview');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket>();
  return {
    view,
    setView,
    notificationsOpen,
    setNotificationsOpen,
    createOpen,
    setCreateOpen,
    selectedTicket,
    setSelectedTicket,
  };
}

function useWorkspaceActions(
  viewState: ReturnType<typeof useWorkspaceViewState>,
  tickets: TicketsState,
  notifications: NotificationsState,
) {
  const [actionError, setActionError] = useState<string>();
  async function openTicket(ticket: Ticket) {
    try {
      setActionError(undefined);
      viewState.setSelectedTicket(await ticketsApi.get(ticketId(ticket)));
    } catch (reason) {
      viewState.setSelectedTicket(undefined);
      setActionError(
        reason instanceof Error ? reason.message : 'No fue posible cargar el detalle autorizado.',
      );
    }
  }
  async function created(ticket: Ticket) {
    viewState.setCreateOpen(false);
    await tickets.loadTickets();
    await openTicket(ticket);
  }
  async function markNotificationRead(notification: Notification) {
    try {
      setActionError(undefined);
      await notifications.markNotificationRead(notification);
    } catch (reason) {
      setActionError(
        reason instanceof Error
          ? reason.message
          : 'No fue posible marcar la notificación como leída.',
      );
    }
  }
  function changeView(nextView: View) {
    setActionError(undefined);
    if (nextView === 'overview') {
      tickets.setSearchInput('');
      tickets.setFilters({ page: 1, limit: 10 });
    }
    viewState.setView(nextView);
  }
  return {
    actionError,
    onViewChange: changeView,
    onOpenTicket: openTicket,
    onCreated: created,
    markNotificationRead,
    onToggleNotifications: () => viewState.setNotificationsOpen((current) => !current),
    onCloseNotifications: () => viewState.setNotificationsOpen(false),
    onCreate: () => viewState.setCreateOpen(true),
    onCloseCreate: () => viewState.setCreateOpen(false),
    onCloseTicket: () => viewState.setSelectedTicket(undefined),
  };
}

function getStats(tickets: Ticket[], total: number) {
  return {
    total,
    active: tickets.filter((ticket) => ['OPEN', 'IN_PROGRESS'].includes(ticket.status)).length,
    waiting: tickets.filter((ticket) => ticket.status === 'WAITING_USER').length,
    critical: tickets.filter((ticket) => ticket.priority === 'CRITICAL').length,
  };
}
