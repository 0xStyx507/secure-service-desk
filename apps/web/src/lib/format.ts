import type { Role, TicketPriority, TicketStatus } from '../types';

export const statusLabel: Record<TicketStatus, string> = {
  OPEN: 'Abierto',
  IN_PROGRESS: 'En progreso',
  WAITING_USER: 'Espera usuario',
  RESOLVED: 'Resuelto',
  CLOSED: 'Cerrado',
};

export const priorityLabel: Record<TicketPriority, string> = {
  LOW: 'Baja',
  MEDIUM: 'Media',
  HIGH: 'Alta',
  CRITICAL: 'Crítica',
};

export const roleLabel: Record<Role, string> = {
  ADMIN: 'Administrador',
  SUPPORT: 'Soporte',
  USER: 'Usuario',
};

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function ticketId(ticket: { _id: string; id?: string }): string {
  return ticket.id ?? ticket._id;
}

export function initials(email: string): string {
  return email.slice(0, 2).toUpperCase();
}
