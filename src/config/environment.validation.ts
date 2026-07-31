type Environment = Record<string, unknown>;

function parsePositiveInteger(value: unknown, fallback: number, name: string): number {
  const parsed = value === undefined ? fallback : Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

export function validateEnvironment(environment: Environment): Environment {
  const nodeEnv = String(environment.NODE_ENV ?? 'development');
  const port = parsePositiveInteger(environment.PORT, 3000, 'PORT');
  const throttleTtlMs = parsePositiveInteger(
    environment.THROTTLE_TTL_MS,
    60_000,
    'THROTTLE_TTL_MS',
  );
  const throttleLimit = parsePositiveInteger(environment.THROTTLE_LIMIT, 60, 'THROTTLE_LIMIT');
  const jwtAccessTtlSeconds = parsePositiveInteger(
    environment.JWT_ACCESS_TTL_SECONDS,
    900,
    'JWT_ACCESS_TTL_SECONDS',
  );
  const refreshTokenTtlSeconds = parsePositiveInteger(
    environment.REFRESH_TOKEN_TTL_SECONDS,
    604_800,
    'REFRESH_TOKEN_TTL_SECONDS',
  );
  const maxLoginAttempts = parsePositiveInteger(
    environment.MAX_LOGIN_ATTEMPTS,
    5,
    'MAX_LOGIN_ATTEMPTS',
  );
  const loginLockSeconds = parsePositiveInteger(
    environment.LOGIN_LOCK_SECONDS,
    900,
    'LOGIN_LOCK_SECONDS',
  );
  const cacheTtlSeconds = parsePositiveInteger(
    environment.CACHE_TTL_SECONDS,
    30,
    'CACHE_TTL_SECONDS',
  );
  const queueRecoveryIntervalMs = parsePositiveInteger(
    environment.QUEUE_RECOVERY_INTERVAL_MS,
    60_000,
    'QUEUE_RECOVERY_INTERVAL_MS',
  );
  const mongodbUri = String(
    environment.MONGODB_URI ?? 'mongodb://localhost:27017/secure_service_desk',
  ).trim();
  const corsOrigins = String(environment.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const cookieSecure = String(environment.COOKIE_SECURE ?? nodeEnv === 'production') === 'true';
  const redisUrl = String(environment.REDIS_URL ?? 'redis://localhost:6379').trim();
  const bootstrapAdminEmail = String(environment.BOOTSTRAP_ADMIN_EMAIL ?? '').trim();
  const bootstrapAdminPassword = String(environment.BOOTSTRAP_ADMIN_PASSWORD ?? '');
  const allowAdminBootstrap = String(environment.ALLOW_ADMIN_BOOTSTRAP ?? 'false') === 'true';
  const refreshCookieName = String(
    environment.REFRESH_COOKIE_NAME ?? 'service_desk_refresh',
  ).trim();
  const csrfCookieName = String(environment.CSRF_COOKIE_NAME ?? 'service_desk_csrf').trim();
  const jwtKeyId = String(environment.JWT_KEY_ID ?? '').trim();
  const jwtPrivateKey = String(environment.JWT_PRIVATE_KEY_BASE64 ?? '').trim();
  const jwtPublicKey = String(environment.JWT_PUBLIC_KEY_BASE64 ?? '').trim();

  if (!mongodbUri.startsWith('mongodb')) {
    throw new Error('MONGODB_URI must be a MongoDB connection string');
  }

  if (nodeEnv === 'production' && !cookieSecure) {
    throw new Error('COOKIE_SECURE must be true in production');
  }
  if (
    nodeEnv === 'production' &&
    (!refreshCookieName.startsWith('__Host-') || !csrfCookieName.startsWith('__Host-'))
  ) {
    throw new Error('Authentication cookie names must use the __Host- prefix in production');
  }
  if (
    nodeEnv === 'production' &&
    (!jwtKeyId || !jwtPrivateKey || !jwtPublicKey || corsOrigins.length === 0)
  ) {
    throw new Error('JWT keys, JWT_KEY_ID and at least one CORS origin are required in production');
  }
  if (!redisUrl.startsWith('redis://') && !redisUrl.startsWith('rediss://')) {
    throw new Error('REDIS_URL must use redis:// or rediss://');
  }
  if (nodeEnv === 'production' && !redisUrl.startsWith('rediss://')) {
    throw new Error('REDIS_URL must use rediss:// in production');
  }
  if (Boolean(bootstrapAdminEmail) !== Boolean(bootstrapAdminPassword)) {
    throw new Error(
      'BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD must be configured together',
    );
  }
  if (bootstrapAdminEmail && !allowAdminBootstrap) {
    throw new Error('ALLOW_ADMIN_BOOTSTRAP=true is required to run the one-time bootstrap');
  }
  if (
    bootstrapAdminPassword &&
    (bootstrapAdminPassword.length < 16 ||
      !/[A-Z]/.test(bootstrapAdminPassword) ||
      !/[a-z]/.test(bootstrapAdminPassword) ||
      !/\d/.test(bootstrapAdminPassword))
  ) {
    throw new Error(
      'BOOTSTRAP_ADMIN_PASSWORD must be at least 16 characters with upper, lower and digit',
    );
  }

  return {
    ...environment,
    nodeEnv,
    port,
    mongodbUri,
    corsOrigins,
    throttleTtlMs,
    throttleLimit,
    jwtAccessTtlSeconds,
    refreshTokenTtlSeconds,
    maxLoginAttempts,
    loginLockSeconds,
    cacheTtlSeconds,
    queueRecoveryIntervalMs,
    cookieSecure,
    redisUrl,
    bootstrapAdminEmail,
    bootstrapAdminPassword,
    allowAdminBootstrap,
    refreshCookieName,
    csrfCookieName,
  };
}
