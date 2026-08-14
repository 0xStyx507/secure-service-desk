import { ArrowIcon, BellIcon, PlusIcon, TicketIcon } from '../../components/Icons';
import { formatDate } from '../../lib/format';
import type { Notification, Ticket } from '../../types';
import { TicketTable } from './TicketTable';

interface OverviewProps {
  stats: { total: number; active: number; waiting: number; critical: number };
  tickets: Ticket[];
  notifications: Notification[];
  notificationsState: 'loading' | 'ready' | 'error';
  loading: boolean;
  onOpenTicket: (ticket: Ticket) => void;
  onViewAll: () => void;
  onCreate: () => void;
  onRetryNotifications: () => Promise<void>;
}

export function Overview(props: OverviewProps) {
  return (
    <div className="overview-grid">
      <MetricCards stats={props.stats} />
      <RecentTickets
        tickets={props.tickets}
        loading={props.loading}
        onOpenTicket={props.onOpenTicket}
        onViewAll={props.onViewAll}
      />
      <NotificationPanel
        notifications={props.notifications}
        notificationsState={props.notificationsState}
        onRetryNotifications={props.onRetryNotifications}
        onCreate={props.onCreate}
      />
    </div>
  );
}

function MetricCards({ stats }: Pick<OverviewProps, 'stats'>) {
  const cards = [
    { label: 'Tickets visibles', value: stats.total, trend: 'Alcance según tu rol', tone: 'mint' },
    {
      label: 'Activos en página',
      value: stats.active,
      trend: 'Abiertos o en progreso',
      tone: 'blue',
    },
    {
      label: 'Esperando usuario en página',
      value: stats.waiting,
      trend: 'Requieren respuesta',
      tone: 'amber',
    },
    {
      label: 'Críticos en página',
      value: stats.critical,
      trend: 'Atención inmediata',
      tone: 'coral',
    },
  ];
  return (
    <section className="metric-grid" aria-label="Resumen de la cola">
      {cards.map((card) => (
        <article className="metric-card" key={card.label}>
          <span className={`metric-card__icon ${card.tone}`}>
            <TicketIcon />
          </span>
          <p>{card.label}</p>
          <strong>{card.value}</strong>
          <small>{card.trend}</small>
        </article>
      ))}
    </section>
  );
}

function RecentTickets({
  tickets,
  loading,
  onOpenTicket,
  onViewAll,
}: Pick<OverviewProps, 'tickets' | 'loading' | 'onOpenTicket' | 'onViewAll'>) {
  return (
    <section className="panel panel--tickets">
      <div className="panel__heading">
        <div>
          <p className="eyebrow">LIVE QUEUE</p>
          <h2>Actividad reciente</h2>
        </div>
        <button className="text-button" onClick={onViewAll}>
          Ver toda la cola <ArrowIcon />
        </button>
      </div>
      <TicketTable tickets={tickets} loading={loading} onOpen={onOpenTicket} />
    </section>
  );
}

function NotificationPanel({
  notifications,
  notificationsState: state,
  onRetryNotifications: onRetry,
  onCreate,
}: Pick<
  OverviewProps,
  'notifications' | 'notificationsState' | 'onRetryNotifications' | 'onCreate'
>) {
  return (
    <aside className="panel notification-panel">
      <div className="panel__heading">
        <div>
          <p className="eyebrow">INBOX</p>
          <h2>Notificaciones</h2>
        </div>
      </div>
      <NotificationList
        notifications={notifications}
        notificationsState={state}
        onRetryNotifications={onRetry}
      />
      <button className="quick-create" onClick={onCreate}>
        <PlusIcon />
        <span>
          <strong>Crear solicitud</strong>
          <small>Registra un nuevo incidente</small>
        </span>
        <ArrowIcon />
      </button>
    </aside>
  );
}

function NotificationList({
  notifications,
  notificationsState: state,
  onRetryNotifications: onRetry,
}: Pick<OverviewProps, 'notifications' | 'notificationsState' | 'onRetryNotifications'>) {
  return (
    <div className="notification-list">
      <NotificationState
        state={state}
        hasNotifications={notifications.length > 0}
        onRetry={onRetry}
      />
      {notifications.slice(0, 4).map((notification) => (
        <article key={notification._id}>
          <span className={notification.readAt ? 'read' : ''}>
            <BellIcon />
          </span>
          <div>
            <strong>{notification.title}</strong>
            <p>{notification.message}</p>
            <small>{formatDate(notification.createdAt)}</small>
          </div>
        </article>
      ))}
    </div>
  );
}

function NotificationState({
  state,
  hasNotifications,
  onRetry,
}: {
  state: OverviewProps['notificationsState'];
  hasNotifications: boolean;
  onRetry: () => Promise<void>;
}) {
  if (state === 'loading') return <p className="empty-copy">Cargando notificaciones…</p>;
  if (state === 'error')
    return (
      <p className="empty-copy notification-error">
        No fue posible cargar la bandeja.<button onClick={() => void onRetry()}>Reintentar</button>
      </p>
    );
  return !hasNotifications ? <p className="empty-copy">No hay novedades pendientes.</p> : null;
}
