export type Role = 'ADMIN' | 'SUPPORT' | 'USER';

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_USER' | 'RESOLVED' | 'CLOSED';

export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface CurrentUser {
  sub: string;
  email: string;
  roles: Role[];
  authzVersion: number;
}

export interface SessionResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  csrfToken: string;
}

export interface MfaChallenge {
  mfaRequired: true;
  challengeToken: string;
  expiresIn: number;
}

export interface MfaStatus {
  enabled: boolean;
}

export interface MfaSetup {
  secret: string;
  otpauthUri: string;
}

export interface McpToolResult {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}

export interface Ticket {
  _id: string;
  id?: string;
  number: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  requesterId: string;
  assigneeId?: string;
  resolution?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface Paginated<T> {
  items: T[];
  pagination: Pagination;
}

export interface TicketFilters {
  page: number;
  limit: number;
  search?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
}

export interface Notification {
  _id: string;
  title: string;
  message: string;
  type: string;
  readAt?: string;
  createdAt: string;
}

export interface ProblemDetails {
  status: number;
  detail: string | string[];
  requestId?: string;
}
