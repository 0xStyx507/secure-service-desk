import type { FormEvent } from 'react';
import { SearchIcon } from '../../components/Icons';
import { priorityLabel, statusLabel } from '../../lib/format';
import type { Paginated, Ticket, TicketFilters, TicketPriority, TicketStatus } from '../../types';
import { TicketTable } from './TicketTable';

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

export function TicketQueue(props: TicketQueueProps) {
  return (
    <section className="panel queue-panel">
      <QueueTools {...props} />
      <TicketTable tickets={props.data.items} loading={props.loading} onOpen={props.onOpenTicket} />
      <Pagination data={props.data} filters={props.filters} onFilters={props.onFilters} />
    </section>
  );
}

function QueueTools({
  filters,
  searchInput,
  onSearchInput,
  onSearch,
  onFilters,
}: Pick<TicketQueueProps, 'filters' | 'searchInput' | 'onSearchInput' | 'onSearch' | 'onFilters'>) {
  return (
    <div className="queue-tools">
      <form className="search-box" onSubmit={onSearch}>
        <SearchIcon aria-hidden="true" />
        <input
          value={searchInput}
          onChange={(event) => onSearchInput(event.target.value)}
          placeholder="Buscar asunto o descripción"
          aria-label="Buscar tickets"
          maxLength={100}
        />
      </form>
      <select
        value={filters.status ?? ''}
        onChange={(event) =>
          onFilters({
            ...filters,
            page: 1,
            status: (event.target.value || undefined) as TicketStatus | undefined,
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
        value={filters.priority ?? ''}
        onChange={(event) =>
          onFilters({
            ...filters,
            page: 1,
            priority: (event.target.value || undefined) as TicketPriority | undefined,
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
  );
}

function Pagination({
  data,
  filters,
  onFilters,
}: Pick<TicketQueueProps, 'data' | 'filters' | 'onFilters'>) {
  const pages = Math.max(data.pagination.pages, 1);
  return (
    <div className="pagination">
      <span>
        Página {data.pagination.page} de {pages} · {data.pagination.total} resultados
      </span>
      <div>
        <button
          disabled={filters.page <= 1}
          onClick={() => onFilters({ ...filters, page: filters.page - 1 })}
        >
          Anterior
        </button>
        <button
          disabled={filters.page >= data.pagination.pages}
          onClick={() => onFilters({ ...filters, page: filters.page + 1 })}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}
