import type {
  CurrentUser,
  Notification,
  Paginated,
  Role,
  SessionResponse,
  Ticket,
  TicketPriority,
  TicketStatus,
} from '../types';

type JsonRecord = Record<string, unknown>;

function record(value: unknown, contract: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`La API devolvió un contrato ${contract} inválido.`);
  }
  return value as JsonRecord;
}

function stringField(source: JsonRecord, key: string, contract: string): string {
  const value = source[key];
  if (typeof value !== 'string')
    throw new Error(`La API devolvió un contrato ${contract} inválido.`);
  return value;
}

function numberField(source: JsonRecord, key: string, contract: string): number {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`La API devolvió un contrato ${contract} inválido.`);
  }
  return value;
}

function enumField<T extends string>(
  source: JsonRecord,
  key: string,
  values: readonly T[],
  contract: string,
): T {
  const value = stringField(source, key, contract);
  if (!values.includes(value as T))
    throw new Error(`La API devolvió un contrato ${contract} inválido.`);
  return value as T;
}

export function decodeSession(value: unknown): SessionResponse {
  const source = record(value, 'de sesión');
  return {
    accessToken: stringField(source, 'accessToken', 'de sesión'),
    tokenType: enumField(source, 'tokenType', ['Bearer'] as const, 'de sesión'),
    expiresIn: numberField(source, 'expiresIn', 'de sesión'),
    csrfToken: stringField(source, 'csrfToken', 'de sesión'),
  };
}

export function decodeCurrentUser(value: unknown): CurrentUser {
  const source = record(value, 'de identidad');
  const rawRoles = source.roles;
  const validRoles: Role[] = ['ADMIN', 'SUPPORT', 'USER'];
  if (!Array.isArray(rawRoles) || !rawRoles.every((role) => validRoles.includes(role as Role))) {
    throw new Error('La API devolvió un contrato de identidad inválido.');
  }
  return {
    sub: stringField(source, 'sub', 'de identidad'),
    email: stringField(source, 'email', 'de identidad'),
    roles: rawRoles as Role[],
    authzVersion: numberField(source, 'authzVersion', 'de identidad'),
  };
}

export function decodeTicket(value: unknown): Ticket {
  const source = record(value, 'de ticket');
  const id = typeof source.id === 'string' ? source.id : undefined;
  const mongoId = typeof source._id === 'string' ? source._id : id;
  if (!mongoId) throw new Error('La API devolvió un contrato de ticket inválido.');
  return {
    _id: mongoId,
    ...(id ? { id } : {}),
    number: stringField(source, 'number', 'de ticket'),
    subject: stringField(source, 'subject', 'de ticket'),
    description: stringField(source, 'description', 'de ticket'),
    status: enumField<TicketStatus>(
      source,
      'status',
      ['OPEN', 'IN_PROGRESS', 'WAITING_USER', 'RESOLVED', 'CLOSED'],
      'de ticket',
    ),
    priority: enumField<TicketPriority>(
      source,
      'priority',
      ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      'de ticket',
    ),
    requesterId: stringField(source, 'requesterId', 'de ticket'),
    ...(typeof source.assigneeId === 'string' ? { assigneeId: source.assigneeId } : {}),
    ...(typeof source.resolution === 'string' ? { resolution: source.resolution } : {}),
    createdAt: stringField(source, 'createdAt', 'de ticket'),
    updatedAt: stringField(source, 'updatedAt', 'de ticket'),
    version: numberField(source, 'version', 'de ticket'),
  };
}

export function decodeNotification(value: unknown): Notification {
  const source = record(value, 'de notificación');
  return {
    _id: stringField(source, '_id', 'de notificación'),
    title: stringField(source, 'title', 'de notificación'),
    message: stringField(source, 'message', 'de notificación'),
    type: stringField(source, 'type', 'de notificación'),
    ...(typeof source.readAt === 'string' ? { readAt: source.readAt } : {}),
    createdAt: stringField(source, 'createdAt', 'de notificación'),
  };
}

export function decodePage<T>(value: unknown, decodeItem: (item: unknown) => T): Paginated<T> {
  const source = record(value, 'paginado');
  const pagination = record(source.pagination, 'de paginación');
  if (!Array.isArray(source.items))
    throw new Error('La API devolvió un contrato paginado inválido.');
  return {
    items: source.items.map(decodeItem),
    pagination: {
      page: numberField(pagination, 'page', 'de paginación'),
      limit: numberField(pagination, 'limit', 'de paginación'),
      total: numberField(pagination, 'total', 'de paginación'),
      pages: numberField(pagination, 'pages', 'de paginación'),
    },
  };
}
