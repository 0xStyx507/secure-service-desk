export function resolveApiBaseUrl(configured: string | undefined): '/api' {
  const value = configured?.endsWith('/') ? configured.slice(0, -1) : (configured ?? '/api');
  if (value !== '/api') {
    throw new Error('VITE_API_URL must be the same-origin /api path.');
  }
  return '/api';
}
