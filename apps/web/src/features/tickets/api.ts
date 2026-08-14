import type { Paginated, Ticket, TicketFilters } from '../../types';
import { decodePage, decodeTicket } from '../../lib/contracts';
import { sessionManager } from '../../lib/http/client';
import type { SessionManager } from '../../lib/http/SessionManager';

function queryString(filters: TicketFilters): string {
  const params = new URLSearchParams({ page: String(filters.page), limit: String(filters.limit) });
  if (filters.search?.trim()) params.set('search', filters.search.trim());
  if (filters.status) params.set('status', filters.status);
  if (filters.priority) params.set('priority', filters.priority);
  return params.toString();
}

export class TicketsApi {
  constructor(private readonly sessions: SessionManager) {}

  list(filters: TicketFilters): Promise<Paginated<Ticket>> {
    return this.sessions
      .authenticatedRequest<unknown>(`/tickets?${queryString(filters)}`)
      .then((value) => decodePage(value, decodeTicket));
  }

  create(subject: string, description: string): Promise<Ticket> {
    return this.sessions
      .authenticatedRequest<unknown>('/tickets', {
        method: 'POST',
        body: JSON.stringify({ subject, description }),
      })
      .then(decodeTicket);
  }

  get(id: string): Promise<Ticket> {
    return this.sessions
      .authenticatedRequest<unknown>(`/tickets/${encodeURIComponent(id)}`)
      .then(decodeTicket);
  }
}

export const ticketsApi = new TicketsApi(sessionManager);
