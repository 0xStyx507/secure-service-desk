import type { ProblemDetails } from '../../types';
import { resolveApiBaseUrl } from '../api-origin';

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
  if (Array.isArray(problem.detail)) return problem.detail.join(' ');
  return problem.detail ?? fallback;
}

export class HttpClient {
  private readonly baseUrl: string;

  constructor(baseUrl = resolveApiBaseUrl(import.meta.env.VITE_API_URL as string | undefined)) {
    this.baseUrl = baseUrl;
  }

  request<T>(path: string, init: RequestInit = {}, accessToken?: string): Promise<T> {
    return this.readResponse<T>(this.fetch(path, init, accessToken));
  }

  publicRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
    return this.request<T>(path, init);
  }

  private fetch(path: string, init: RequestInit, accessToken?: string): Promise<Response> {
    const headers = new Headers(init.headers);
    if (init.body && !(init.body instanceof FormData))
      headers.set('content-type', 'application/json');
    if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
    return fetch(`${this.baseUrl}${path}`, { ...init, headers, credentials: 'include' });
  }

  private async readResponse<T>(responsePromise: Promise<Response>): Promise<T> {
    const response = await responsePromise;
    if (response.ok) {
      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    }
    const fallback = `La solicitud fallÃ³ con estado ${response.status}.`;
    const problem = (await response.json().catch(() => ({}))) as Partial<ProblemDetails>;
    throw new ApiError(problemMessage(problem, fallback), response.status, problem.requestId);
  }
}
