import { CloseIcon, ShieldIcon } from '../../components/Icons';
import { formatDate } from '../../lib/format';
import type { Ticket } from '../../types';
import { PriorityBadge, StatusBadge } from './TicketTable';

export function TicketDetail({ ticket, onClose }: { ticket: Ticket; onClose: () => void }) {
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
            <span>VersiÃ³n</span>
            <strong>v{ticket.version}</strong>
          </div>
        </div>
        {ticket.resolution && (
          <div className="resolution">
            <ShieldIcon />
            <div>
              <strong>ResoluciÃ³n</strong>
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
