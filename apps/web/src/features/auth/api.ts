import type { CurrentUser, MfaChallenge, MfaSetup, MfaStatus } from '../../types';
import {
  decodeCurrentUser,
  decodeMfaChallenge,
  decodeSession,
  isMfaChallenge,
} from '../../lib/contracts';
import { ApiError } from '../../lib/http/HttpClient';
import { sessionManager } from '../../lib/http/client';
import type { SessionManager } from '../../lib/http/SessionManager';

export class MfaRequiredError extends Error {
  constructor(readonly challenge: MfaChallenge) {
    super('Se requiere un codigo MFA para continuar.');
    this.name = 'MfaRequiredError';
  }
}

export class AuthApi {
  constructor(private readonly sessions: SessionManager) {}

  setSessionExpiredHandler(handler?: () => void): void {
    this.sessions.setSessionExpiredHandler(handler);
  }

  async login(email: string, password: string): Promise<CurrentUser | MfaChallenge> {
    const result = await this.sessions.request<unknown>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (isMfaChallenge(result)) return decodeMfaChallenge(result);
    this.sessions.setSession(decodeSession(result));
    return this.me();
  }

  async completeMfaLogin(challengeToken: string, code: string): Promise<CurrentUser> {
    const session = decodeSession(
      await this.sessions.request<unknown>('/auth/login/mfa', {
        method: 'POST',
        body: JSON.stringify({ challengeToken, code }),
      }),
    );
    this.sessions.setSession(session);
    return this.me();
  }

  async register(email: string, password: string): Promise<CurrentUser> {
    const session = decodeSession(
      await this.sessions.request<unknown>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    );
    this.sessions.setSession(session);
    return this.me();
  }

  async restore(): Promise<CurrentUser | undefined> {
    if (!this.sessions.csrf) return undefined;
    try {
      await this.sessions.refresh();
      return await this.me();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        this.sessions.expireSession();
        return undefined;
      }
      throw error;
    }
  }

  async logout(): Promise<void> {
    try {
      if (this.sessions.csrf) {
        await this.sessions.authenticatedRequest<void>(
          '/auth/logout',
          {
            method: 'POST',
            headers: { 'x-csrf-token': this.sessions.csrf },
          },
          false,
        );
      }
    } finally {
      this.sessions.clearSession();
    }
  }

  me(): Promise<CurrentUser> {
    return this.sessions.authenticatedRequest<unknown>('/auth/me').then(decodeCurrentUser);
  }

  getMfaStatus(): Promise<MfaStatus> {
    return this.sessions.authenticatedRequest<MfaStatus>('/auth/mfa/status');
  }

  setupMfa(password: string): Promise<MfaSetup> {
    return this.sessions.authenticatedRequest<MfaSetup>('/auth/mfa/setup', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  }

  verifyMfaSetup(password: string, code: string): Promise<void> {
    return this.sessions.authenticatedRequest<void>('/auth/mfa/verify-setup', {
      method: 'POST',
      body: JSON.stringify({ password, code }),
    });
  }

  disableMfa(password: string, code: string): Promise<void> {
    return this.sessions.authenticatedRequest<void>('/auth/mfa/disable', {
      method: 'POST',
      body: JSON.stringify({ password, code }),
    });
  }
}

export const authApi = new AuthApi(sessionManager);
