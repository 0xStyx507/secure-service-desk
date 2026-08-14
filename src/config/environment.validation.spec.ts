import { validateEnvironment } from './environment.validation';

describe('validateEnvironment', () => {
  it('requires encrypted Redis and hardened cookies in production', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        MONGODB_URI: 'mongodb://mongo.example:27017/secure_service_desk?tls=true',
        COOKIE_SECURE: 'true',
        REDIS_URL: 'redis://cache.example:6379',
      }),
    ).toThrow('Authentication cookie names must use the __Host- prefix');
  });

  it('rejects a production Redis connection without TLS after cookie hardening', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        MONGODB_URI: 'mongodb://mongo.example:27017/secure_service_desk?tls=true',
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

  it('requires TLS for MongoDB in production', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        MONGODB_URI: 'mongodb://mongo.example:27017/secure_service_desk',
      }),
    ).toThrow('MONGODB_URI must enable TLS in production');

    expect(
      validateEnvironment({
        NODE_ENV: 'production',
        MONGODB_URI: 'mongodb://mongo.example:27017/secure_service_desk?tls=true',
        COOKIE_SECURE: 'true',
        REFRESH_COOKIE_NAME: '__Host-refresh',
        CSRF_COOKIE_NAME: '__Host-csrf',
        REDIS_URL: 'rediss://cache.example:6379',
        CORS_ORIGINS: 'https://portfolio.example',
        JWT_KEY_ID: 'production-key',
        JWT_PRIVATE_KEY_BASE64: 'private',
        JWT_PUBLIC_KEY_BASE64: 'public',
        MFA_ENCRYPTION_KEY_BASE64: Buffer.alloc(32).toString('base64'),
      }).mongodbUri,
    ).toContain('tls=true');
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

  it('defaults proxy trust to direct access and accepts an explicit hop count', () => {
    expect(validateEnvironment({}).trustProxyHops).toBe(0);
    expect(validateEnvironment({ TRUST_PROXY_HOPS: '1' }).trustProxyHops).toBe(1);

    expect(() => validateEnvironment({ TRUST_PROXY_HOPS: '-1' })).toThrow(
      'TRUST_PROXY_HOPS must be a non-negative integer',
    );
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

  it('validates optional AWS-compatible adapter configuration without requiring it', () => {
    expect(validateEnvironment({}).awsRegion).toBe('us-east-1');
    expect(
      validateEnvironment({
        AWS_ENDPOINT_URL: 'http://localhost:4566',
        AWS_ACCESS_KEY_ID: 'test',
        AWS_SECRET_ACCESS_KEY: 'test',
        AWS_S3_BUCKET: 'secure-service-desk-artifacts',
      }).awsEndpointUrl,
    ).toBe('http://localhost:4566');

    expect(() => validateEnvironment({ AWS_ENDPOINT_URL: 'localhost:4566' })).toThrow(
      'AWS_ENDPOINT_URL must be an HTTP or HTTPS URL',
    );
    expect(() => validateEnvironment({ AWS_ACCESS_KEY_ID: 'test' })).toThrow(
      'AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be configured together',
    );
  });
});
