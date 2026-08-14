import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUser, Paginated, Ticket } from '../../types';
import { Workspace } from './Workspace';

const apiMock = vi.hoisted(() => ({
  listTickets: vi.fn(),
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  createTicket: vi.fn(),
  getTicket: vi.fn(),
}));

vi.mock('../../lib/api', () => ({ api: apiMock }));
vi.mock('../tickets/api', () => ({
  ticketsApi: {
    list: apiMock.listTickets,
    create: apiMock.createTicket,
    get: apiMock.getTicket,
  },
}));
vi.mock('../notifications/api', () => ({
  notificationsApi: {
    list: apiMock.listNotifications,
    markRead: apiMock.markNotificationRead,
  },
}));

const user: CurrentUser = {
  sub: '507f1f77bcf86cd799439011',
  email: 'support@example.com',
  roles: ['SUPPORT'],
  authzVersion: 1,
};

function ticket(subject: string, id: string): Ticket {
  return {
    _id: id,
    number: `SD-${id.slice(-6)}`,
    subject,
    description: 'Enough context to validate the visual service desk workflow.',
    status: 'OPEN',
    priority: 'MEDIUM',
    requesterId: '507f1f77bcf86cd799439012',
    createdAt: '2026-07-31T12:00:00.000Z',
    updatedAt: '2026-07-31T12:30:00.000Z',
    version: 0,
  };
}

function page(items: Ticket[]): Paginated<Ticket> {
  return {
    items,
    pagination: { page: 1, limit: 10, total: items.length, pages: items.length ? 1 : 0 },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('Workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.listTickets.mockResolvedValue(page([]));
    apiMock.listNotifications.mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 6, total: 0, pages: 0 },
    });
  });

  it('keeps the newest filtered response when requests complete out of order', async () => {
    const older = deferred<Paginated<Ticket>>();
    const newest = deferred<Paginated<Ticket>>();
    const staleTicket = ticket('Stale result', '507f1f77bcf86cd799439021');
    const currentTicket = ticket('Current filtered result', '507f1f77bcf86cd799439022');
    apiMock.listTickets
      .mockReset()
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newest.promise);

    render(<Workspace user={user} onLogout={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Tickets/ }));
    fireEvent.change(screen.getByLabelText('Filtrar por estado'), { target: { value: 'OPEN' } });

    await act(async () => newest.resolve(page([currentTicket])));
    expect(await screen.findByText('Current filtered result')).toBeInTheDocument();

    await act(async () => older.resolve(page([staleTicket])));
    expect(screen.queryByText('Stale result')).not.toBeInTheDocument();
    expect(screen.getByText('Current filtered result')).toBeInTheDocument();
  });

  it('creates a ticket and opens only its authorized detail response', async () => {
    const created = ticket('Demo ticket created', '507f1f77bcf86cd799439023');
    apiMock.listTickets.mockResolvedValueOnce(page([])).mockResolvedValueOnce(page([created]));
    apiMock.createTicket.mockResolvedValue(created);
    apiMock.getTicket.mockResolvedValue(created);

    render(<Workspace user={user} onLogout={vi.fn()} />);
    await screen.findByText('No hay tickets para estos filtros.');
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo ticket' }));
    fireEvent.change(screen.getByLabelText('Asunto'), {
      target: { value: created.subject },
    });
    fireEvent.change(screen.getByLabelText('Descripción'), {
      target: { value: created.description },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear ticket' }));

    expect(await screen.findByRole('heading', { name: created.subject })).toBeInTheDocument();
    expect(apiMock.createTicket).toHaveBeenCalledWith(created.subject, created.description);
    expect(apiMock.getTicket).toHaveBeenCalledWith(created._id);
  });

  it('does not expose a list snapshot when the detail read is rejected', async () => {
    const visible = ticket('Access changed', '507f1f77bcf86cd799439024');
    apiMock.listTickets.mockResolvedValue(page([visible]));
    apiMock.getTicket.mockRejectedValue(new Error('Ticket is no longer visible.'));

    render(<Workspace user={user} onLogout={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Tickets/ }));
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(visible.number) }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Ticket is no longer visible.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('distinguishes notification failure from a legitimately empty inbox', async () => {
    apiMock.listNotifications
      .mockRejectedValueOnce(new Error('Unavailable'))
      .mockResolvedValueOnce({
        items: [],
        pagination: { page: 1, limit: 6, total: 0, pages: 0 },
      });

    render(<Workspace user={user} onLogout={vi.fn()} />);
    expect(await screen.findByText('No fue posible cargar la bandeja.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() =>
      expect(screen.getByText('No hay novedades pendientes.')).toBeInTheDocument(),
    );
  });

  it('opens the notification bell and marks an unread item as read', async () => {
    const notification = {
      _id: '507f1f77bcf86cd799439099',
      title: 'Ticket actualizado',
      message: 'El ticket SD-000099 cambio de estado.',
      type: 'TICKET_UPDATED',
      createdAt: '2026-07-31T12:00:00.000Z',
    };
    apiMock.listNotifications.mockResolvedValue({
      items: [notification],
      pagination: { page: 1, limit: 6, total: 1, pages: 1 },
    });
    apiMock.markNotificationRead.mockResolvedValue({
      ...notification,
      readAt: '2026-07-31T12:01:00.000Z',
    });

    render(<Workspace user={user} onLogout={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Notificaciones' }));
    expect((await screen.findAllByText('Ticket actualizado')).length).toBeGreaterThanOrEqual(1);
    fireEvent.click(screen.getByRole('button', { name: /Ticket actualizado/ }));

    await waitFor(() =>
      expect(apiMock.markNotificationRead).toHaveBeenCalledWith(notification._id),
    );
  });
});
