type Environment = Record<string, unknown>;

export interface JwtKeyRingEntry {
  kid: string;
  privateKeyBase64?: string;
  publicKeyBase64: string;
}

function parsePositiveInteger(value: unknown, fallback: number, name: string): number {
  const parsed = value === undefined ? fallback : Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

function parseNonNegativeInteger(value: unknown, fallback: number, name: string): number {
  const parsed = value === undefined ? fallback : Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }

  return parsed;
}

function readRuntimeSettings(environment: Environment) {
  const nodeEnv = String(environment.NODE_ENV ?? 'development');
  return {
    nodeEnv,
    port: parsePositiveInteger(environment.PORT, 3000, 'PORT'),
    throttleTtlMs: parsePositiveInteger(environment.THROTTLE_TTL_MS, 60_000, 'THROTTLE_TTL_MS'),
    throttleLimit: parsePositiveInteger(environment.THROTTLE_LIMIT, 60, 'THROTTLE_LIMIT'),
    jwtAccessTtlSeconds: parsePositiveInteger(
      environment.JWT_ACCESS_TTL_SECONDS,
      900,
      'JWT_ACCESS_TTL_SECONDS',
    ),
    refreshTokenTtlSeconds: parsePositiveInteger(
      environment.REFRESH_TOKEN_TTL_SECONDS,
      604_800,
      'REFRESH_TOKEN_TTL_SECONDS',
    ),
    maxLoginAttempts: parsePositiveInteger(environment.MAX_LOGIN_ATTEMPTS, 5, 'MAX_LOGIN_ATTEMPTS'),
    loginLockSeconds: parsePositiveInteger(
      environment.LOGIN_LOCK_SECONDS,
      900,
      'LOGIN_LOCK_SECONDS',
    ),
    cacheTtlSeconds: parsePositiveInteger(environment.CACHE_TTL_SECONDS, 30, 'CACHE_TTL_SECONDS'),
    queueRecoveryIntervalMs: parsePositiveInteger(
      environment.QUEUE_RECOVERY_INTERVAL_MS,
      60_000,
      'QUEUE_RECOVERY_INTERVAL_MS',
    ),
    pdfRetentionDays: parsePositiveInteger(
      environment.PDF_RETENTION_DAYS,
      30,
      'PDF_RETENTION_DAYS',
    ),
    trustProxyHops: parseNonNegativeInteger(environment.TRUST_PROXY_HOPS, 0, 'TRUST_PROXY_HOPS'),
    mongodbUri: String(
      environment.MONGODB_URI ?? 'mongodb://localhost:27017/secure_service_desk',
    ).trim(),
    corsOrigins: String(environment.CORS_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    cookieSecure: String(environment.COOKIE_SECURE ?? nodeEnv === 'production') === 'true',
    redisUrl: String(environment.REDIS_URL ?? 'redis://localhost:6379').trim(),
    metricsEnabled: String(environment.METRICS_ENABLED ?? 'false') === 'true',
    metricsToken: String(environment.METRICS_TOKEN ?? '').trim(),
  };
}

function readAuthSettings(environment: Environment) {
  const jwtKeyId = String(environment.JWT_KEY_ID ?? '').trim();
  const jwtPrivateKey = String(environment.JWT_PRIVATE_KEY_BASE64 ?? '').trim();
  const jwtPublicKey = String(environment.JWT_PUBLIC_KEY_BASE64 ?? '').trim();
  return {
    refreshCookieName: String(environment.REFRESH_COOKIE_NAME ?? 'service_desk_refresh').trim(),
    csrfCookieName: String(environment.CSRF_COOKIE_NAME ?? 'service_desk_csrf').trim(),
    jwtKeyId,
    jwtKeyRing: parseJwtKeyRing(environment.JWT_KEY_RING_JSON, {
      kid: jwtKeyId,
      privateKeyBase64: jwtPrivateKey,
      publicKeyBase64: jwtPublicKey,
    }),
    mfaEncryptionKeyBase64: String(environment.MFA_ENCRYPTION_KEY_BASE64 ?? '').trim(),
  };
}

function readCloudSettings(environment: Environment) {
  return {
    awsRegion: String(environment.AWS_REGION ?? 'us-east-1').trim(),
    awsEndpointUrl: String(environment.AWS_ENDPOINT_URL ?? '').trim(),
    awsAccessKeyId: String(environment.AWS_ACCESS_KEY_ID ?? '').trim(),
    awsSecretAccessKey: String(environment.AWS_SECRET_ACCESS_KEY ?? '').trim(),
    awsS3Bucket: String(environment.AWS_S3_BUCKET ?? '').trim(),
    awsSqsQueueUrl: String(environment.AWS_SQS_QUEUE_URL ?? '').trim(),
    awsCloudWatchNamespace: String(
      environment.AWS_CLOUDWATCH_NAMESPACE ?? 'SecureServiceDesk',
    ).trim(),
  };
}

function readBootstrapSettings(environment: Environment) {
  return {
    bootstrapAdminEmail: String(environment.BOOTSTRAP_ADMIN_EMAIL ?? '').trim(),
    bootstrapAdminPassword: String(environment.BOOTSTRAP_ADMIN_PASSWORD ?? ''),
    allowAdminBootstrap: String(environment.ALLOW_ADMIN_BOOTSTRAP ?? 'false') === 'true',
  };
}

function readEnvironment(environment: Environment) {
  return {
    ...readRuntimeSettings(environment),
    ...readAuthSettings(environment),
    ...readCloudSettings(environment),
    ...readBootstrapSettings(environment),
  };
}

type ParsedEnvironment = ReturnType<typeof readEnvironment>;

export function validateEnvironment(environment: Environment): Environment {
  const config = readEnvironment(environment);
  validateMongoConnection(config);
  validateProductionAuthentication(config);
  validateRedisConnection(config);
  validateMfaConfiguration(config);
  validateMetricsConfiguration(config);
  validateCloud(config);
  validateBootstrap(config);
  return { ...environment, ...config };
}

function validateMongoConnection(config: ParsedEnvironment): void {
  if (!config.mongodbUri.startsWith('mongodb')) {
    throw new Error('MONGODB_URI must be a MongoDB connection string');
  }
  if (
    config.nodeEnv === 'production' &&
    !config.mongodbUri.startsWith('mongodb+srv://') &&
    !/[?&](tls|ssl)=true/i.test(config.mongodbUri)
  ) {
    throw new Error('MONGODB_URI must enable TLS in production');
  }
}

function validateRedisConnection(config: ParsedEnvironment): void {
  if (!config.redisUrl.startsWith('redis://') && !config.redisUrl.startsWith('rediss://')) {
    throw new Error('REDIS_URL must use redis:// or rediss://');
  }
  if (config.nodeEnv === 'production' && !config.redisUrl.startsWith('rediss://')) {
    throw new Error('REDIS_URL must use rediss:// in production');
  }
}

function validateProductionAuthentication(config: ParsedEnvironment): void {
  if (config.nodeEnv === 'production' && !config.cookieSecure) {
    throw new Error('COOKIE_SECURE must be true in production');
  }
  if (config.nodeEnv === 'production' && !hasHostCookieNames(config)) {
    throw new Error('Authentication cookie names must use the __Host- prefix in production');
  }
  if (config.nodeEnv === 'production' && !hasProductionJwtConfig(config)) {
    throw new Error('JWT keys, JWT_KEY_ID and at least one CORS origin are required in production');
  }
}

function validateMfaConfiguration(config: ParsedEnvironment): void {
  if (
    config.mfaEncryptionKeyBase64 &&
    Buffer.from(config.mfaEncryptionKeyBase64, 'base64').length !== 32
  ) {
    throw new Error('MFA_ENCRYPTION_KEY_BASE64 must encode exactly 32 bytes');
  }
  if (config.nodeEnv === 'production' && !config.mfaEncryptionKeyBase64) {
    throw new Error('MFA_ENCRYPTION_KEY_BASE64 is required in production');
  }
}

function validateMetricsConfiguration(config: ParsedEnvironment): void {
  if (config.metricsEnabled && config.metricsToken.length < 32) {
    throw new Error('METRICS_TOKEN must be at least 32 characters when metrics are enabled');
  }
}

function hasHostCookieNames(config: ParsedEnvironment): boolean {
  return (
    config.refreshCookieName.startsWith('__Host-') && config.csrfCookieName.startsWith('__Host-')
  );
}

function hasProductionJwtConfig(config: ParsedEnvironment): boolean {
  return Boolean(
    config.jwtKeyId &&
    jwtKeyRingHasActivePrivateKey(config.jwtKeyRing, config.jwtKeyId) &&
    config.corsOrigins.length > 0,
  );
}

function validateCloud(config: ParsedEnvironment): void {
  if (!/^[a-z0-9-]{1,63}$/i.test(config.awsRegion)) {
    throw new Error('AWS_REGION must be a valid region identifier');
  }
  if (config.awsEndpointUrl && !/^https?:\/\/[^\s]+$/i.test(config.awsEndpointUrl)) {
    throw new Error('AWS_ENDPOINT_URL must be an HTTP or HTTPS URL');
  }
  if (Boolean(config.awsAccessKeyId) !== Boolean(config.awsSecretAccessKey)) {
    throw new Error('AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be configured together');
  }
  if (
    config.awsS3Bucket.length > 63 ||
    config.awsSqsQueueUrl.length > 512 ||
    config.awsCloudWatchNamespace.length > 255
  ) {
    throw new Error('AWS resource configuration exceeds its maximum length');
  }
}

function validateBootstrap(config: ParsedEnvironment): void {
  if (Boolean(config.bootstrapAdminEmail) !== Boolean(config.bootstrapAdminPassword)) {
    throw new Error(
      'BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD must be configured together',
    );
  }
  if (config.bootstrapAdminEmail && !config.allowAdminBootstrap) {
    throw new Error('ALLOW_ADMIN_BOOTSTRAP=true is required to run the one-time bootstrap');
  }
  if (hasWeakBootstrapPassword(config.bootstrapAdminPassword)) {
    throw new Error(
      'BOOTSTRAP_ADMIN_PASSWORD must be at least 16 characters with upper, lower and digit',
    );
  }
}

function hasWeakBootstrapPassword(password: string): boolean {
  return Boolean(
    password &&
    (password.length < 16 ||
      !/[A-Z]/.test(password) ||
      !/[a-z]/.test(password) ||
      !/\d/.test(password)),
  );
}

function parseJwtKeyRing(value: unknown, fallback: JwtKeyRingEntry): JwtKeyRingEntry[] {
  if (typeof value !== 'string' || value.trim() === '') {
    return fallback.kid && fallback.privateKeyBase64 && fallback.publicKeyBase64 ? [fallback] : [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('JWT_KEY_RING_JSON must be valid JSON');
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 10) {
    throw new Error('JWT_KEY_RING_JSON must contain between 1 and 10 keys');
  }
  return parsed.map((entry, index) => parseJwtKeyRingEntry(entry, index));
}

function parseJwtKeyRingEntry(entry: unknown, index: number): JwtKeyRingEntry {
  if (typeof entry !== 'object' || entry === null) {
    throw new Error(`JWT_KEY_RING_JSON entry ${index} is invalid`);
  }
  const candidate = entry as Record<string, unknown>;
  const kid = String(candidate.kid ?? '').trim();
  const privateKeyValue = String(candidate.privateKeyBase64 ?? '').trim();
  const publicKeyBase64 = String(candidate.publicKeyBase64 ?? '').trim();
  if (!kid || !publicKeyBase64) {
    throw new Error(`JWT_KEY_RING_JSON entry ${index} is incomplete`);
  }
  return {
    kid,
    ...(privateKeyValue ? { privateKeyBase64: privateKeyValue } : {}),
    publicKeyBase64,
  };
}

function jwtKeyRingHasActivePrivateKey(ring: JwtKeyRingEntry[], activeKid: string): boolean {
  return ring.some((entry) => entry.kid === activeKid && Boolean(entry.privateKeyBase64));
}
