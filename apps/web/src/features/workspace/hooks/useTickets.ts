import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ticketsApi } from '../../tickets/api';
import type { Paginated, Ticket, TicketFilters } from '../../../types';

const emptyTickets: Paginated<Ticket> = {
  items: [],
  pagination: { page: 1, limit: 10, total: 0, pages: 0 },
};

export function useTickets() {
  const [tickets, setTickets] = useState<Paginated<Ticket>>(emptyTickets);
  const [filters, setFilters] = useState<TicketFilters>({ page: 1, limit: 10 });
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const requestId = useRef(0);

  const loadTickets = useCallback(async () => {
    const currentRequestId = ++requestId.current;
    setLoading(true);
    setError(undefined);
    try {
      const result = await ticketsApi.list(filters);
      if (currentRequestId === requestId.current) setTickets(result);
    } catch (reason) {
      if (currentRequestId === requestId.current) {
        setError(reason instanceof Error ? reason.message : 'No fue posible cargar los tickets.');
      }
    } finally {
      if (currentRequestId === requestId.current) setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters((current) => ({ ...current, page: 1, search: searchInput || undefined }));
  }

  return {
    tickets,
    filters,
    setFilters,
    searchInput,
    setSearchInput,
    loading,
    error,
    loadTickets,
    search,
  };
}
