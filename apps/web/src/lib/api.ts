import type {
  CurrentUser,
  Notification,
  Paginated,
  ProblemDetails,
  SessionResponse,
  Ticket,
  TicketFilters,
} from '../types';
import {
  decodeCurrentUser,
  decodeNotification,
  decodePage,
  decodeSession,
  decodeTicket,
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

  async login(email: string, password: string): Promise<CurrentUser> {
    const session = decodeSession(
      await this.publicRequest<unknown>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
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
