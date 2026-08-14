import { ArrowIcon } from '../../components/Icons';
import { formatDate, priorityLabel, statusLabel, ticketId } from '../../lib/format';
import type { Ticket, TicketPriority, TicketStatus } from '../../types';

export function TicketTable({
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
        <span className="spinner" /> Cargando cola seguraâ€¦
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

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={`badge status-${status.toLowerCase()}`}>
      <i />
      {statusLabel[status]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  return (
    <span className={`priority priority-${priority.toLowerCase()}`}>
      <i />
      {priorityLabel[priority]}
    </span>
  );
}
