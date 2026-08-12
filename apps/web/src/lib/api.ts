import type {
  CurrentUser,
  MfaChallenge,
  MfaSetup,
  MfaStatus,
  McpToolResult,
  Notification,
  Paginated,
  ProblemDetails,
  SessionResponse,
  Ticket,
  TicketFilters,
} from '../types';
import {
  decodeCurrentUser,
  decodeMfaChallenge,
  decodeNotification,
  decodePage,
  decodeSession,
  decodeTicket,
  isMfaChallenge,
} from './contracts';
import { resolveApiBaseUrl } from './api-origin';

const apiBaseUrl = resolveApiBaseUrl(import.meta.env.VITE_API_URL as string | undefined);
const csrfStorageKey = 'secure-service-desk.csrf';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class MfaRequiredError extends Error {
  constructor(readonly challenge: MfaChallenge) {
    super('Se requiere un codigo MFA para continuar.');
    this.name = 'MfaRequiredError';
  }
}

function problemMessage(problem: Partial<ProblemDetails>, fallback: string): string {
  if (Array.isArray(problem.detail)) {
    return problem.detail.join(' ');
  }
  return problem.detail ?? fallback;
}

function queryString(filters: TicketFilters): string {
  const params = new URLSearchParams({
    page: String(filters.page),
    limit: String(filters.limit),
  });
  if (filters.search?.trim()) params.set('search', filters.search.trim());
  if (filters.status) params.set('status', filters.status);
  if (filters.priority) params.set('priority', filters.priority);
  return params.toString();
}

export class ApiClient {
  private accessToken?: string;
  private csrfToken = sessionStorage.getItem(csrfStorageKey) ?? undefined;
  private refreshPromise?: Promise<void>;
  private sessionExpiredHandler?: () => void;

  setSessionExpiredHandler(handler?: () => void): void {
    this.sessionExpiredHandler = handler;
  }

  async login(email: string, password: string): Promise<CurrentUser | MfaChallenge> {
    const result = await this.publicRequest<unknown>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (isMfaChallenge(result)) return decodeMfaChallenge(result);
    const session = decodeSession(result);
    this.setSession(session);
    return this.me();
  }

  async completeMfaLogin(challengeToken: string, code: string): Promise<CurrentUser> {
    const session = decodeSession(
      await this.publicRequest<unknown>('/auth/login/mfa', {
        method: 'POST',
        body: JSON.stringify({ challengeToken, code }),
      }),
    );
    this.setSession(session);
    return this.me();
  }

  async register(email: string, password: string): Promise<CurrentUser> {
    const session = decodeSession(
      await this.publicRequest<unknown>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    );
    this.setSession(session);
    return this.me();
  }

  async restore(): Promise<CurrentUser | undefined> {
    if (!this.csrfToken) return undefined;
    try {
      await this.refresh();
      return await this.me();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        this.expireSession();
        return undefined;
      }
      throw error;
    }
  }

  async logout(): Promise<void> {
    try {
      if (this.csrfToken) {
        await this.request<void>(
          '/auth/logout',
          { method: 'POST', headers: { 'x-csrf-token': this.csrfToken } },
          false,
        );
      }
    } finally {
      this.clearSession();
    }
  }

  me(): Promise<CurrentUser> {
    return this.request<unknown>('/auth/me').then(decodeCurrentUser);
  }

  listTickets(filters: TicketFilters): Promise<Paginated<Ticket>> {
    return this.request<unknown>(`/tickets?${queryString(filters)}`).then((value) =>
      decodePage(value, decodeTicket),
    );
  }

  createTicket(subject: string, description: string): Promise<Ticket> {
    return this.request<unknown>('/tickets', {
      method: 'POST',
      body: JSON.stringify({ subject, description }),
    }).then(decodeTicket);
  }

  getTicket(id: string): Promise<Ticket> {
    return this.request<unknown>(`/tickets/${encodeURIComponent(id)}`).then(decodeTicket);
  }

  listNotifications(): Promise<Paginated<Notification>> {
    return this.request<unknown>('/notifications?page=1&limit=6').then((value) =>
      decodePage(value, decodeNotification),
    );
  }

  markNotificationRead(id: string): Promise<Notification> {
    return this.request<unknown>(`/notifications/${encodeURIComponent(id)}/read`, {
      method: 'PATCH',
    }).then(decodeNotification);
  }

  getMfaStatus(): Promise<MfaStatus> {
    return this.request<MfaStatus>('/auth/mfa/status');
  }

  setupMfa(): Promise<MfaSetup> {
    return this.request<MfaSetup>('/auth/mfa/setup', { method: 'POST' });
  }

  verifyMfaSetup(code: string): Promise<void> {
    return this.request<void>('/auth/mfa/verify-setup', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  disableMfa(password: string, code: string): Promise<void> {
    return this.request<void>('/auth/mfa/disable', {
      method: 'POST',
      body: JSON.stringify({ password, code }),
    });
  }

  async callMcpTool(
    name: string,
    argumentsValue: Record<string, unknown> = {},
  ): Promise<McpToolResult> {
    const response = await this.request<unknown>('/mcp', {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method: 'tools/call',
        params: { name, arguments: argumentsValue },
      }),
    });
    if (!response || typeof response !== 'object') {
      throw new Error('La respuesta MCP no tiene un formato valido.');
    }
    const result = response as { error?: { message?: string }; result?: McpToolResult };
    if (result.error) throw new Error(result.error.message ?? 'La herramienta MCP fallo.');
    if (!result.result) throw new Error('La respuesta MCP no contiene resultado.');
    if (result.result.isError) {
      const text = result.result.content?.find((item) => item.type === 'text')?.text;
      throw new Error(text ?? 'La herramienta MCP fallo.');
    }
    return result.result;
  }

  private async refresh(): Promise<void> {
    if (!this.csrfToken) throw new ApiError('La sesión no se puede renovar.', 401);
    if (!this.refreshPromise) {
      this.refreshPromise = this.publicRequest<unknown>('/auth/refresh', {
        method: 'POST',
        headers: { 'x-csrf-token': this.csrfToken },
      })
        .then(decodeSession)
        .then((session) => this.setSession(session))
        .finally(() => {
          this.refreshPromise = undefined;
        });
    }
    return this.refreshPromise;
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
    retryAfterRefresh = true,
  ): Promise<T> {
    const response = await this.fetch(path, init, this.accessToken);
    if (response.status === 401 && retryAfterRefresh && this.csrfToken) {
      try {
        await this.refresh();
        return this.request<T>(path, init, false);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          this.expireSession();
        }
        throw error;
      }
    }
    if (response.status === 401) {
      this.expireSession();
    }
    return this.readResponse<T>(response);
  }

  private async publicRequest<T>(path: string, init: RequestInit): Promise<T> {
    return this.readResponse<T>(await this.fetch(path, init));
  }

  private fetch(path: string, init: RequestInit, token?: string): Promise<Response> {
    const headers = new Headers(init.headers);
    if (init.body && !(init.body instanceof FormData)) {
      headers.set('content-type', 'application/json');
    }
    if (token) headers.set('authorization', `Bearer ${token}`);
    return fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers,
      credentials: 'include',
    });
  }

  private async readResponse<T>(response: Response): Promise<T> {
    if (response.ok) {
      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    }
    const fallback = `La solicitud falló con estado ${response.status}.`;
    const problem = (await response.json().catch(() => ({}))) as Partial<ProblemDetails>;
    throw new ApiError(problemMessage(problem, fallback), response.status, problem.requestId);
  }

  private setSession(session: SessionResponse): void {
    this.accessToken = session.accessToken;
    this.csrfToken = session.csrfToken;
    sessionStorage.setItem(csrfStorageKey, session.csrfToken);
  }

  private clearSession(): void {
    this.accessToken = undefined;
    this.csrfToken = undefined;
    sessionStorage.removeItem(csrfStorageKey);
  }

  private expireSession(): void {
    this.clearSession();
    this.sessionExpiredHandler?.();
  }
}

export const api = new ApiClient();
