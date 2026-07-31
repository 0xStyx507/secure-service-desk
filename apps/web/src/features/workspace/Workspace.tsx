import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ArrowIcon,
  BellIcon,
  CloseIcon,
  GridIcon,
  LogoutIcon,
  PlusIcon,
  SearchIcon,
  ShieldIcon,
  TicketIcon,
} from '../../components/Icons';
import { api } from '../../lib/api';
import {
  formatDate,
  initials,
  priorityLabel,
  roleLabel,
  statusLabel,
  ticketId,
} from '../../lib/format';
import type {
  CurrentUser,
  Notification,
  Paginated,
  Ticket,
  TicketFilters,
  TicketPriority,
  TicketStatus,
} from '../../types';

interface WorkspaceProps {
  user: CurrentUser;
  onLogout: () => Promise<void>;
}

const emptyTickets: Paginated<Ticket> = {
  items: [],
  pagination: { page: 1, limit: 10, total: 0, pages: 0 },
};

export function Workspace({ user, onLogout }: WorkspaceProps) {
  const [view, setView] = useState<'overview' | 'tickets'>('overview');
  const [tickets, setTickets] = useState<Paginated<Ticket>>(emptyTickets);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationsState, setNotificationsState] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [filters, setFilters] = useState<TicketFilters>({ page: 1, limit: 10 });
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket>();
  const ticketRequestId = useRef(0);

  const loadTickets = useCallback(async () => {
    const requestId = ++ticketRequestId.current;
    setLoading(true);
    setError(undefined);
    try {
      const result = await api.listTickets(filters);
      if (requestId === ticketRequestId.current) setTickets(result);
    } catch (reason) {
      if (requestId === ticketRequestId.current) {
        setError(reason instanceof Error ? reason.message : 'No fue posible cargar los tickets.');
      }
    } finally {
      if (requestId === ticketRequestId.current) setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  const loadNotifications = useCallback(async () => {
    setNotificationsState('loading');
    try {
      const result = await api.listNotifications();
      setNotifications(result.items);
      setNotificationsState('ready');
    } catch {
      setNotificationsState('error');
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const stats = useMemo(
    () => ({
      total: tickets.pagination.total,
      active: tickets.items.filter((ticket) => ['OPEN', 'IN_PROGRESS'].includes(ticket.status))
        .length,
      waiting: tickets.items.filter((ticket) => ticket.status === 'WAITING_USER').length,
      critical: tickets.items.filter((ticket) => ticket.priority === 'CRITICAL').length,
    }),
    [tickets],
  );

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters((current) => ({ ...current, page: 1, search: searchInput || undefined }));
  }

  async function openTicket(ticket: Ticket) {
    try {
      setSelectedTicket(await api.getTicket(ticketId(ticket)));
    } catch (reason) {
      setSelectedTicket(undefined);
      setError(
        reason instanceof Error ? reason.message : 'No fue posible cargar el detalle autorizado.',
      );
    }
  }

  async function created(ticket: Ticket) {
    setCreateOpen(false);
    await loadTickets();
    await openTicket(ticket);
  }

  const primaryRole = user.roles.includes('ADMIN')
    ? 'ADMIN'
    : user.roles.includes('SUPPORT')
      ? 'SUPPORT'
      : 'USER';

  function showOverview() {
    setSearchInput('');
    setFilters({ page: 1, limit: 10 });
    setView('overview');
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Secure Service Desk">
          <span className="brand__mark">
            <ShieldIcon aria-hidden="true" />
          </span>
          <span>
            <strong>Secure</strong>
            <small>Service Desk</small>
          </span>
        </a>

        <nav className="nav" aria-label="Navegación principal">
          <p>WORKSPACE</p>
          <button className={view === 'overview' ? 'active' : ''} onClick={showOverview}>
            <GridIcon aria-hidden="true" /> Resumen
          </button>
          <button className={view === 'tickets' ? 'active' : ''} onClick={() => setView('tickets')}>
            <TicketIcon aria-hidden="true" /> Tickets
            <span className="nav-count">{tickets.pagination.total}</span>
          </button>
        </nav>

        <div className="sidebar__security">
          <ShieldIcon aria-hidden="true" />
          <div>
            <strong>Sesión protegida</strong>
            <span>JWT · HttpOnly · CSRF</span>
          </div>
        </div>

        <div className="user-block">
          <span className="avatar">{initials(user.email)}</span>
          <div>
            <strong>{user.email}</strong>
            <span>{roleLabel[primaryRole]}</span>
          </div>
          <button onClick={() => void onLogout()} aria-label="Cerrar sesión">
            <LogoutIcon />
          </button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">SERVICE OPERATIONS</p>
            <h1>{view === 'overview' ? 'Centro de operaciones' : 'Cola de tickets'}</h1>
          </div>
          <div className="topbar__actions">
            <span className="environment">
              <i /> Demo environment
            </span>
            <button className="icon-button" aria-label="Notificaciones">
              <BellIcon />
              {notifications.some((item) => !item.readAt) && <span className="notification-dot" />}
            </button>
            <button className="button button--primary" onClick={() => setCreateOpen(true)}>
              <PlusIcon /> Nuevo ticket
            </button>
          </div>
        </header>

        {error && (
          <div className="inline-alert" role="alert">
            {error}
            <button onClick={() => void loadTickets()}>Reintentar</button>
          </div>
        )}

        {view === 'overview' ? (
          <Overview
            stats={stats}
            tickets={tickets.items.slice(0, 5)}
            notifications={notifications}
            notificationsState={notificationsState}
            loading={loading}
            onOpenTicket={openTicket}
            onViewAll={() => setView('tickets')}
            onCreate={() => setCreateOpen(true)}
            onRetryNotifications={loadNotifications}
          />
        ) : (
          <TicketQueue
            data={tickets}
            filters={filters}
            searchInput={searchInput}
            loading={loading}
            onSearchInput={setSearchInput}
            onSearch={search}
            onFilters={setFilters}
            onOpenTicket={openTicket}
          />
        )}
      </main>

      {createOpen && (
        <CreateTicketDialog onClose={() => setCreateOpen(false)} onCreated={created} />
      )}
      {selectedTicket && (
        <TicketDetail ticket={selectedTicket} onClose={() => setSelectedTicket(undefined)} />
      )}
    </div>
  );
}

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

function Overview(props: OverviewProps) {
  const cards = [
    {
      label: 'Tickets visibles',
      value: props.stats.total,
      trend: 'Alcance según tu rol',
      tone: 'mint',
    },
    {
      label: 'Activos en página',
      value: props.stats.active,
      trend: 'Abiertos o en progreso',
      tone: 'blue',
    },
    {
      label: 'Esperando usuario en página',
      value: props.stats.waiting,
      trend: 'Requieren respuesta',
      tone: 'amber',
    },
    {
      label: 'Críticos en página',
      value: props.stats.critical,
      trend: 'Atención inmediata',
      tone: 'coral',
    },
  ];
  return (
    <div className="overview-grid">
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

      <section className="panel panel--tickets">
        <div className="panel__heading">
          <div>
            <p className="eyebrow">LIVE QUEUE</p>
            <h2>Actividad reciente</h2>
          </div>
          <button className="text-button" onClick={props.onViewAll}>
            Ver toda la cola <ArrowIcon />
          </button>
        </div>
        <TicketTable tickets={props.tickets} loading={props.loading} onOpen={props.onOpenTicket} />
      </section>

      <aside className="panel notification-panel">
        <div className="panel__heading">
          <div>
            <p className="eyebrow">INBOX</p>
            <h2>Notificaciones</h2>
          </div>
        </div>
        <div className="notification-list">
          {props.notificationsState === 'loading' && (
            <p className="empty-copy">Cargando notificaciones…</p>
          )}
          {props.notificationsState === 'error' && (
            <p className="empty-copy notification-error">
              No fue posible cargar la bandeja.
              <button onClick={() => void props.onRetryNotifications()}>Reintentar</button>
            </p>
          )}
          {props.notificationsState === 'ready' && props.notifications.length === 0 && (
            <p className="empty-copy">No hay novedades pendientes.</p>
          )}
          {props.notifications.slice(0, 4).map((notification) => (
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
        <button className="quick-create" onClick={props.onCreate}>
          <PlusIcon />
          <span>
            <strong>Crear solicitud</strong>
            <small>Registra un nuevo incidente</small>
          </span>
          <ArrowIcon />
        </button>
      </aside>
    </div>
  );
}

interface TicketQueueProps {
  data: Paginated<Ticket>;
  filters: TicketFilters;
  searchInput: string;
  loading: boolean;
  onSearchInput: (value: string) => void;
  onSearch: (event: FormEvent<HTMLFormElement>) => void;
  onFilters: (filters: TicketFilters) => void;
  onOpenTicket: (ticket: Ticket) => void;
}

function TicketQueue(props: TicketQueueProps) {
  return (
    <section className="panel queue-panel">
      <div className="queue-tools">
        <form className="search-box" onSubmit={props.onSearch}>
          <SearchIcon aria-hidden="true" />
          <input
            value={props.searchInput}
            onChange={(e) => props.onSearchInput(e.target.value)}
            placeholder="Buscar asunto o descripción"
            aria-label="Buscar tickets"
            maxLength={100}
          />
        </form>
        <select
          value={props.filters.status ?? ''}
          onChange={(e) =>
            props.onFilters({
              ...props.filters,
              page: 1,
              status: (e.target.value || undefined) as TicketStatus | undefined,
            })
          }
          aria-label="Filtrar por estado"
        >
          <option value="">Todos los estados</option>
          {Object.entries(statusLabel).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={props.filters.priority ?? ''}
          onChange={(e) =>
            props.onFilters({
              ...props.filters,
              page: 1,
              priority: (e.target.value || undefined) as TicketPriority | undefined,
            })
          }
          aria-label="Filtrar por prioridad"
        >
          <option value="">Todas las prioridades</option>
          {Object.entries(priorityLabel).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <TicketTable tickets={props.data.items} loading={props.loading} onOpen={props.onOpenTicket} />
      <div className="pagination">
        <span>
          Página {props.data.pagination.page} de {Math.max(props.data.pagination.pages, 1)} ·{' '}
          {props.data.pagination.total} resultados
        </span>
        <div>
          <button
            disabled={props.filters.page <= 1}
            onClick={() => props.onFilters({ ...props.filters, page: props.filters.page - 1 })}
          >
            Anterior
          </button>
          <button
            disabled={props.filters.page >= props.data.pagination.pages}
            onClick={() => props.onFilters({ ...props.filters, page: props.filters.page + 1 })}
          >
            Siguiente
          </button>
        </div>
      </div>
    </section>
  );
}

function TicketTable({
  tickets,
  loading,
  onOpen,
}: {
  tickets: Ticket[];
  loading: boolean;
  onOpen: (ticket: Ticket) => void;
}) {
  if (loading)
    return (
      <div className="table-state">
        <span className="spinner" /> Cargando cola segura…
      </div>
    );
  if (tickets.length === 0)
    return <div className="table-state">No hay tickets para estos filtros.</div>;
  return (
    <div className="ticket-table" aria-label="Tickets">
      <div className="ticket-row ticket-row--head" aria-hidden="true">
        <span>ID</span>
        <span>Solicitud</span>
        <span>Estado</span>
        <span>Prioridad</span>
        <span>Actualizado</span>
        <span />
      </div>
      {tickets.map((ticket) => (
        <button className="ticket-row" key={ticketId(ticket)} onClick={() => onOpen(ticket)}>
          <span className="ticket-number">{ticket.number}</span>
          <span className="ticket-subject">
            <strong>{ticket.subject}</strong>
            <small>{ticket.description}</small>
          </span>
          <span>
            <StatusBadge status={ticket.status} />
          </span>
          <span>
            <PriorityBadge priority={ticket.priority} />
          </span>
          <span className="date-cell">{formatDate(ticket.updatedAt)}</span>
          <span>
            <ArrowIcon className="row-arrow" />
          </span>
        </button>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={`badge status-${status.toLowerCase()}`}>
      <i />
      {statusLabel[status]}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: TicketPriority }) {
  return (
    <span className={`priority priority-${priority.toLowerCase()}`}>
      <i />
      {priorityLabel[priority]}
    </span>
  );
}

function CreateTicketDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (ticket: Ticket) => Promise<void>;
}) {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const subjectInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    subjectInput.current?.focus();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose, saving]);

  function close() {
    if (!saving) onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    try {
      await onCreated(await api.createTicket(subject, description));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No fue posible crear el ticket.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-title"
        aria-busy={saving}
      >
        <button className="dialog__close" onClick={close} aria-label="Cerrar" disabled={saving}>
          <CloseIcon />
        </button>
        <p className="eyebrow">NEW REQUEST</p>
        <h2 id="create-title">¿Cómo podemos ayudarte?</h2>
        <p className="muted">
          Describe el incidente con suficiente contexto para que soporte pueda actuar.
        </p>
        <form onSubmit={submit} className="dialog-form">
          <label>
            Asunto
            <input
              ref={subjectInput}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              minLength={3}
              maxLength={160}
              required
              placeholder="Ej. No puedo acceder al portal"
            />
          </label>
          <label>
            Descripción
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              minLength={10}
              maxLength={10000}
              required
              rows={6}
              placeholder="Qué ocurrió, cuándo comenzó y qué intentaste…"
            />
          </label>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <div className="dialog__actions">
            <button
              type="button"
              className="button button--ghost"
              onClick={close}
              disabled={saving}
            >
              Cancelar
            </button>
            <button className="button button--primary" disabled={saving}>
              {saving ? 'Creando…' : 'Crear ticket'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function TicketDetail({ ticket, onClose }: { ticket: Ticket; onClose: () => void }) {
  return (
    <div
      className="drawer-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <aside
        className="ticket-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ticket-title"
      >
        <button className="dialog__close" onClick={onClose} aria-label="Cerrar">
          <CloseIcon />
        </button>
        <div className="drawer__top">
          <span className="ticket-number">{ticket.number}</span>
          <StatusBadge status={ticket.status} />
        </div>
        <h2 id="ticket-title">{ticket.subject}</h2>
        <p className="drawer__description">{ticket.description}</p>
        <div className="ticket-facts">
          <div>
            <span>Prioridad</span>
            <PriorityBadge priority={ticket.priority} />
          </div>
          <div>
            <span>Creado</span>
            <strong>{formatDate(ticket.createdAt)}</strong>
          </div>
          <div>
            <span>Actualizado</span>
            <strong>{formatDate(ticket.updatedAt)}</strong>
          </div>
          <div>
            <span>Versión</span>
            <strong>v{ticket.version}</strong>
          </div>
        </div>
        {ticket.resolution && (
          <div className="resolution">
            <ShieldIcon />
            <div>
              <strong>Resolución</strong>
              <p>{ticket.resolution}</p>
            </div>
          </div>
        )}
        <div className="drawer__audit">
          <p className="eyebrow">ACCESS CONTROL</p>
          <p>Este recurso fue cargado aplicando el alcance autorizado para tu identidad.</p>
        </div>
      </aside>
    </div>
  );
}
