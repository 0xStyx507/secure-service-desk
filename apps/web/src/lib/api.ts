import type {
  CurrentUser,
  MfaChallenge,
  MfaSetup,
  MfaStatus,
  McpToolResult,
  Notification,
  Paginated,
  Ticket,
  TicketFilters,
} from '../types';
import { AuthApi, MfaRequiredError } from '../features/auth/api';
import { McpApi } from '../features/mcp/api';
import { NotificationsApi } from '../features/notifications/api';
import { TicketsApi } from '../features/tickets/api';
import { HttpClient, ApiError } from './http/HttpClient';
import { SessionManager } from './http/SessionManager';

export { ApiError, MfaRequiredError };

/**
 * Compatibility facade for existing consumers. New code should import the
 * feature API or auth API directly so transport and domain boundaries remain
 * visible.
 */
export class ApiClient {
  private readonly sessions: SessionManager;
  private readonly auth: AuthApi;
  private readonly tickets: TicketsApi;
  private readonly notifications: NotificationsApi;
  private readonly mcp: McpApi;

  constructor(http = new HttpClient()) {
    this.sessions = new SessionManager(http);
    this.auth = new AuthApi(this.sessions);
    this.tickets = new TicketsApi(this.sessions);
    this.notifications = new NotificationsApi(this.sessions);
    this.mcp = new McpApi(this.sessions);
  }

  setSessionExpiredHandler(handler?: () => void): void {
    this.auth.setSessionExpiredHandler(handler);
  }

  login(email: string, password: string): Promise<CurrentUser | MfaChallenge> {
    return this.auth.login(email, password);
  }

  completeMfaLogin(challengeToken: string, code: string): Promise<CurrentUser> {
    return this.auth.completeMfaLogin(challengeToken, code);
  }

  register(email: string, password: string): Promise<CurrentUser> {
    return this.auth.register(email, password);
  }

  restore(): Promise<CurrentUser | undefined> {
    return this.auth.restore();
  }

  logout(): Promise<void> {
    return this.auth.logout();
  }

  me(): Promise<CurrentUser> {
    return this.auth.me();
  }

  listTickets(filters: TicketFilters): Promise<Paginated<Ticket>> {
    return this.tickets.list(filters);
  }

  createTicket(subject: string, description: string): Promise<Ticket> {
    return this.tickets.create(subject, description);
  }

  getTicket(id: string): Promise<Ticket> {
    return this.tickets.get(id);
  }

  listNotifications(): Promise<Paginated<Notification>> {
    return this.notifications.list();
  }

  markNotificationRead(id: string): Promise<Notification> {
    return this.notifications.markRead(id);
  }

  getMfaStatus(): Promise<MfaStatus> {
    return this.auth.getMfaStatus();
  }

  setupMfa(password: string): Promise<MfaSetup> {
    return this.auth.setupMfa(password);
  }

  verifyMfaSetup(password: string, code: string): Promise<void> {
    return this.auth.verifyMfaSetup(password, code);
  }

  disableMfa(password: string, code: string): Promise<void> {
    return this.auth.disableMfa(password, code);
  }

  callMcpTool(name: string, argumentsValue: Record<string, unknown> = {}): Promise<McpToolResult> {
    return this.mcp.callTool(name, argumentsValue);
  }
}

export const api = new ApiClient();
