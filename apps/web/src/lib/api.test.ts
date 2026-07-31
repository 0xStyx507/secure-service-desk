import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUser, SessionResponse } from '../types';
import { ApiClient } from './api';
import { resolveApiBaseUrl } from './api-origin';

const session: SessionResponse = {
  accessToken: 'short-lived-access-token',
  tokenType: 'Bearer',
  expiresIn: 900,
  csrfToken: 'double-submit-csrf',
};

const user: CurrentUser = {
  sub: '507f1f77bcf86cd799439011',
  email: 'user@example.com',
  roles: ['USER'],
  authzVersion: 1,
};

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('ApiClient session handling', () => {
  beforeEach(() => sessionStorage.clear());

  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it('stores only CSRF state and sends the access token from memory', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(session))
      .mockResolvedValueOnce(response(user));
    vi.stubGlobal('fetch', fetchMock);

    const client = new ApiClient();
    await client.login('user@example.com', 'Portfolio123');

    expect(sessionStorage.length).toBe(1);
    expect(sessionStorage.getItem('secure-service-desk.csrf')).toBe(session.csrfToken);
    expect(JSON.stringify(sessionStorage)).not.toContain(session.accessToken);

    const identityRequest = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(new Headers(identityRequest[1].headers).get('authorization')).toBe(
      `Bearer ${session.accessToken}`,
    );
  });

  it('restores a tab by rotating the HttpOnly-backed session with CSRF', async () => {
    sessionStorage.setItem('secure-service-desk.csrf', 'persisted-csrf');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(session))
      .mockResolvedValueOnce(response(user));
    vi.stubGlobal('fetch', fetchMock);

    const restored = await new ApiClient().restore();

    expect(restored).toEqual(user);
    const refreshRequest = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(refreshRequest[0]).toContain('/auth/refresh');
    expect(new Headers(refreshRequest[1].headers).get('x-csrf-token')).toBe('persisted-csrf');
    expect(refreshRequest[1].credentials).toBe('include');
  });

  it('purges local session state after a terminal unauthorized response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(session))
      .mockResolvedValueOnce(response(user))
      .mockResolvedValueOnce(response({ detail: 'Expired.' }, 401))
      .mockResolvedValueOnce(response({ detail: 'Invalid refresh session.' }, 401));
    vi.stubGlobal('fetch', fetchMock);

    const client = new ApiClient();
    const expired = vi.fn();
    client.setSessionExpiredHandler(expired);
    await client.login('user@example.com', 'Portfolio123');
    await expect(client.listTickets({ page: 1, limit: 10 })).rejects.toThrow(
      'Invalid refresh session.',
    );

    expect(sessionStorage.length).toBe(0);
    expect(expired).toHaveBeenCalledTimes(1);
    await expect(client.restore()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('preserves recoverable CSRF state after a transient refresh failure', async () => {
    sessionStorage.setItem('secure-service-desk.csrf', 'recoverable-csrf');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response({ detail: 'Dependency unavailable.' }, 503)),
    );

    await expect(new ApiClient().restore()).rejects.toThrow('Dependency unavailable.');
    expect(sessionStorage.getItem('secure-service-desk.csrf')).toBe('recoverable-csrf');
  });

  it('rejects cross-origin API destinations before credentials can be sent', () => {
    expect(resolveApiBaseUrl('/api')).toBe('/api');
    expect(resolveApiBaseUrl('/api/')).toBe('/api');
    expect(() => resolveApiBaseUrl('https://example.net/api')).toThrow(/same-origin/i);
    expect(() => resolveApiBaseUrl('//example.net/api')).toThrow(/same-origin/i);
    expect(() => resolveApiBaseUrl('/\\evil.example/api')).toThrow(/same-origin/i);
    expect(() => resolveApiBaseUrl('/\\\\evil.example/api')).toThrow(/same-origin/i);
    expect(() => resolveApiBaseUrl('/api/..//evil.example')).toThrow(/same-origin/i);
    expect(() => resolveApiBaseUrl('/api/%2e%2e//evil.example')).toThrow(/same-origin/i);
  });
});
