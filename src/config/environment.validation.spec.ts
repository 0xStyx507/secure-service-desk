import { validateEnvironment } from './environment.validation';

describe('validateEnvironment', () => {
  it('requires encrypted Redis and hardened cookies in production', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        COOKIE_SECURE: 'true',
        REDIS_URL: 'redis://cache.example:6379',
      }),
    ).toThrow('Authentication cookie names must use the __Host- prefix');
  });

  it('rejects a production Redis connection without TLS after cookie hardening', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        COOKIE_SECURE: 'true',
        REFRESH_COOKIE_NAME: '__Host-refresh',
        CSRF_COOKIE_NAME: '__Host-csrf',
        REDIS_URL: 'redis://cache.example:6379',
        CORS_ORIGINS: 'https://portfolio.example',
        JWT_KEY_ID: 'production-key',
        JWT_PRIVATE_KEY_BASE64: 'private',
        JWT_PUBLIC_KEY_BASE64: 'public',
      }),
    ).toThrow('REDIS_URL must use rediss:// in production');
  });

  it('requires explicit authorization for the one-time admin bootstrap', () => {
    expect(() =>
      validateEnvironment({
        BOOTSTRAP_ADMIN_EMAIL: 'admin@example.com',
        BOOTSTRAP_ADMIN_PASSWORD: 'StrongBootstrap123',
      }),
    ).toThrow('ALLOW_ADMIN_BOOTSTRAP=true');
  });

  it('normalizes the queue recovery interval and rejects invalid values', () => {
    expect(
      validateEnvironment({
        QUEUE_RECOVERY_INTERVAL_MS: '250',
      }).queueRecoveryIntervalMs,
    ).toBe(250);

    expect(() =>
      validateEnvironment({
        QUEUE_RECOVERY_INTERVAL_MS: '0',
      }),
    ).toThrow('QUEUE_RECOVERY_INTERVAL_MS must be a positive integer');
  });

  it('accepts an overlapping JWT key ring with a public-only retired key', () => {
    const result = validateEnvironment({
      JWT_KEY_ID: 'current',
      JWT_KEY_RING_JSON: JSON.stringify([
        { kid: 'current', privateKeyBase64: 'private', publicKeyBase64: 'public' },
        { kid: 'retired', publicKeyBase64: 'old-public' },
      ]),
    });

    expect(result.jwtKeyRing).toHaveLength(2);
  });
});
