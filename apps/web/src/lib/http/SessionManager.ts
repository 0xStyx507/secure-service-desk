import type { SessionResponse } from '../../types';
import { decodeSession } from '../contracts';
import { ApiError, HttpClient } from './HttpClient';

const csrfStorageKey = 'secure-service-desk.csrf';

export class SessionManager {
  private accessToken?: string;
  private csrfToken = sessionStorage.getItem(csrfStorageKey) ?? undefined;
  private refreshPromise?: Promise<void>;
  private sessionExpiredHandler?: () => void;

  constructor(private readonly http: HttpClient) {}

  get csrf(): string | undefined {
    return this.csrfToken;
  }

  setSessionExpiredHandler(handler?: () => void): void {
    this.sessionExpiredHandler = handler;
  }

  setSession(session: SessionResponse): void {
    this.accessToken = session.accessToken;
    this.csrfToken = session.csrfToken;
    sessionStorage.setItem(csrfStorageKey, session.csrfToken);
  }

  async refresh(): Promise<void> {
    if (!this.csrfToken) throw new ApiError('La sesiÃ³n no se puede renovar.', 401);
    if (!this.refreshPromise) {
      this.refreshPromise = this.http
        .publicRequest<unknown>('/auth/refresh', {
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

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.http.request<T>(path, init, this.accessToken);
    return response;
  }

  async authenticatedRequest<T>(
    path: string,
    init: RequestInit = {},
    retryAfterRefresh = true,
  ): Promise<T> {
    try {
      return await this.http.request<T>(path, init, this.accessToken);
    } catch (error) {
      return this.handleRequestError<T>(error, path, init, retryAfterRefresh);
    }
  }

  private async handleRequestError<T>(
    error: unknown,
    path: string,
    init: RequestInit,
    retryAfterRefresh: boolean,
  ): Promise<T> {
    if (!this.shouldRefresh(error, retryAfterRefresh)) {
      this.expireOnUnauthorized(error);
      throw error;
    }
    try {
      await this.refresh();
      return await this.authenticatedRequest<T>(path, init, false);
    } catch (refreshError) {
      this.expireOnUnauthorized(refreshError);
      throw refreshError;
    }
  }

  private shouldRefresh(error: unknown, retryAfterRefresh: boolean): boolean {
    return (
      error instanceof ApiError &&
      error.status === 401 &&
      retryAfterRefresh &&
      Boolean(this.csrfToken)
    );
  }

  private expireOnUnauthorized(error: unknown): void {
    if (error instanceof ApiError && error.status === 401) this.expireSession();
  }

  clearSession(): void {
    this.accessToken = undefined;
    this.csrfToken = undefined;
    sessionStorage.removeItem(csrfStorageKey);
  }

  expireSession(): void {
    this.clearSession();
    this.sessionExpiredHandler?.();
  }
}
