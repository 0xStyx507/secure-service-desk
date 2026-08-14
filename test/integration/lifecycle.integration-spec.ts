import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { getConnectionToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { MongoDBContainer, type StartedMongoDBContainer } from '@testcontainers/mongodb';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { createHash, generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { join } from 'node:path';
import type { Queue } from 'bullmq';
import Redis from 'ioredis';
import type { Connection, Model } from 'mongoose';
import request from 'supertest';
import { MfaCryptoService } from '../../src/modules/auth/mfa-crypto.service';
import type { UserDocument } from '../../src/modules/users/schemas/user.schema';
import { UsersService } from '../../src/modules/users/users.service';
import { NOTIFICATIONS_QUEUE } from '../../src/modules/notifications/notifications.constants';
import { REPORTS_QUEUE } from '../../src/modules/reports/reports.constants';

const MONGO_IMAGE =
  'mongo:7.0@sha256:9bdaeb6dac6e7e762e84e2f84103d1f9bb078fa1ba6bde8bb9d2274f655ad173';
const REDIS_IMAGE =
  'redis:7-alpine@sha256:e7723ff73d963f5cc6d9c4643ea3d989527a402a319239054e9472a7fb9219a2';
const MONGO_HEALTH_CHECK = {
  test: [
    'CMD-SHELL',
    "mongosh --quiet --eval 'try { rs.status(); } catch (e) { rs.initiate(); } while (db.runCommand({isMaster: 1}).ismaster==false) { sleep(100); }'",
  ] as ['CMD-SHELL', string],
  interval: 5_000,
  timeout: 60_000,
  retries: 1_000,
};
const TEST_ORIGIN = 'http://localhost:3001';
const ADMIN_EMAIL = `admin-${randomUUID()}@integration.test`;
const ADMIN_PASSWORD = 'IntegrationAdmin123!';
const USER_EMAIL = `user-${randomUUID()}@integration.test`;
const USER_PASSWORD = 'IntegrationUser123!';

const environmentKeys = [
  'NODE_ENV',
  'MONGODB_URI',
  'REDIS_URL',
  'CORS_ORIGINS',
  'THROTTLE_LIMIT',
  'JWT_ISSUER',
  'JWT_AUDIENCE',
  'JWT_KEY_ID',
  'JWT_PRIVATE_KEY_BASE64',
  'JWT_PUBLIC_KEY_BASE64',
  'COOKIE_SECURE',
  'ALLOW_ADMIN_BOOTSTRAP',
  'BOOTSTRAP_ADMIN_EMAIL',
  'BOOTSTRAP_ADMIN_PASSWORD',
  'QUEUE_RECOVERY_INTERVAL_MS',
  'MFA_ENCRYPTION_KEY_BASE64',
] as const;

const originalEnvironment = new Map(environmentKeys.map((key) => [key, process.env[key]] as const));

function configureEnvironment(mongodbUri: string, redisUrl: string): void {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 3_072,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  Object.assign(process.env, {
    NODE_ENV: 'test',
    MONGODB_URI: mongodbUri,
    REDIS_URL: redisUrl,
    CORS_ORIGINS: TEST_ORIGIN,
    THROTTLE_LIMIT: '1000',
    JWT_ISSUER: 'secure-service-desk-integration',
    JWT_AUDIENCE: 'secure-service-desk-integration-client',
    JWT_KEY_ID: `integration-${randomUUID()}`,
    JWT_PRIVATE_KEY_BASE64: Buffer.from(privateKey).toString('base64'),
    JWT_PUBLIC_KEY_BASE64: Buffer.from(publicKey).toString('base64'),
    COOKIE_SECURE: 'false',
    ALLOW_ADMIN_BOOTSTRAP: 'true',
    BOOTSTRAP_ADMIN_EMAIL: ADMIN_EMAIL,
    BOOTSTRAP_ADMIN_PASSWORD: ADMIN_PASSWORD,
    QUEUE_RECOVERY_INTERVAL_MS: '250',
    MFA_ENCRYPTION_KEY_BASE64: randomBytes(32).toString('base64'),
  });
}

function restoreEnvironment(): void {
  for (const [key, value] of originalEnvironment) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function eventually<T>(
  producer: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs = 20_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastValue: T;
  do {
    lastValue = await producer();
    if (predicate(lastValue)) {
      return lastValue;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  } while (Date.now() < deadline);

  throw new Error(`Integration condition was not met within ${timeoutMs} ms.`);
}

function resourceId(body: Record<string, unknown>): string {
  const value = body.id ?? body._id;
  if (typeof value !== 'string') {
    throw new Error('Integration response did not include a resource identifier.');
  }
  return value;
}

async function findAvailablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Could not allocate an integration port.');
  }
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

async function stopChildProcess(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  child.kill('SIGTERM');
  const closed = once(child, 'close');
  const timedOut = new Promise<never>((_, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Process ${child.pid} ignored SIGTERM.`)),
      10_000,
    );
    timer.unref();
  });
  try {
    await Promise.race([closed, timedOut]);
  } catch (error) {
    child.kill('SIGKILL');
    await once(child, 'close').catch(() => undefined);
    throw error;
  }
}

describe('real infrastructure lifecycle and integration', () => {
  let mongoContainer: StartedMongoDBContainer | undefined;
  let redisContainer: StartedRedisContainer | undefined;
  let app: INestApplication | undefined;
  let workerContext: INestApplicationContext | undefined;
  let redisClient: Redis | undefined;
  let databaseName: string;
  let adminAccessToken: string;

  async function cleanupIntegrationResources(): Promise<void> {
    const failures: unknown[] = [];
    try {
      const contextResults = await Promise.allSettled([
        app?.close() ?? Promise.resolve(),
        workerContext?.close() ?? Promise.resolve(),
        redisClient?.quit() ?? Promise.resolve(),
      ]);
      failures.push(
        ...contextResults
          .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
          .map((result) => result.reason as unknown),
      );

      const containerResults = await Promise.allSettled([
        redisContainer?.stop() ?? Promise.resolve(),
        mongoContainer?.stop() ?? Promise.resolve(),
      ]);
      failures.push(
        ...containerResults
          .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
          .map((result) => result.reason as unknown),
      );
    } finally {
      app = undefined;
      workerContext = undefined;
      redisClient = undefined;
      redisContainer = undefined;
      mongoContainer = undefined;
      restoreEnvironment();
    }

    if (failures.length > 0) {
      throw new AggregateError(failures, 'One or more integration resources failed to close.');
    }
  }

  beforeAll(async () => {
    databaseName = `secure_service_desk_it_${randomUUID().replaceAll('-', '')}`;
    try {
      mongoContainer = await new MongoDBContainer(MONGO_IMAGE)
        .withHealthCheck(MONGO_HEALTH_CHECK)
        .start();
      redisContainer = await new RedisContainer(REDIS_IMAGE).start();

      const mongodbUri = `${mongoContainer
        .getConnectionString()
        .replace(/\/$/, '')}/${databaseName}?directConnection=true`;
      const redisUrl = redisContainer.getConnectionUrl();
      configureEnvironment(mongodbUri, redisUrl);
      redisClient = new Redis(redisUrl, {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
      });
      await redisClient.connect();
      expect(mongodbUri).toContain(databaseName);
      expect(databaseName).toMatch(/^secure_service_desk_it_[a-f0-9]+$/);

      jest.resetModules();
      const { createApp } = await import('../../src/main');
      app = await createApp();
      await app.init();

      const { createWorkerContext } = await import('../../src/worker');
      workerContext = await createWorkerContext();

      const adminLogin = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
        .expect(200);
      adminAccessToken = adminLogin.body.accessToken as string;
    } catch (error) {
      try {
        await cleanupIntegrationResources();
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          'Integration setup and cleanup both failed.',
        );
      }
      throw error;
    }
  }, 180_000);

  afterAll(async () => {
    await cleanupIntegrationResources();
  }, 120_000);

  it('starts API and worker against isolated ready dependencies', async () => {
    if (!app) {
      throw new Error('Integration API was not initialized.');
    }
    const connection = app.get<Connection>(getConnectionToken());
    expect(connection.name).toBe(databaseName);

    await request(app.getHttpServer()).get('/api/health/live').expect(200).expect({ status: 'ok' });

    await request(app.getHttpServer())
      .get('/api/health/ready')
      .expect(200)
      .expect({
        status: 'ready',
        dependencies: { mongodb: 'up', redis: 'up' },
      });

    await request(app.getHttpServer()).get('/api/tickets').expect(401);
  });

  it('atomically counts concurrent failed logins and locks the account', async () => {
    if (!app) {
      throw new Error('Integration API was not initialized.');
    }

    const server = app.getHttpServer();
    const email = `concurrent-login-${randomUUID()}@integration.test`;
    await request(server)
      .post('/api/auth/register')
      .send({ email, password: 'ConcurrentLogin123!' })
      .expect(201);

    const connection = app.get<Connection>(getConnectionToken());
    const userModel = connection.model<UserDocument>('User') as Model<UserDocument>;
    const usersService = new UsersService(
      userModel,
      {} as never,
      new ConfigService({ maxLoginAttempts: 5, loginLockSeconds: 900 }),
    );
    const registeredUser = await connection.db?.collection('users').findOne({ email });
    if (!registeredUser?._id) {
      throw new Error('Concurrent login test user was not persisted.');
    }
    await Promise.all(
      Array.from({ length: 8 }, () =>
        usersService.registerFailedLogin({ _id: registeredUser._id } as UserDocument),
      ),
    );

    const storedUser = await connection.db?.collection('users').findOne({ email });
    expect(storedUser?.failedLoginAttempts).toBe(0);
    expect(storedUser?.lockedUntil).toBeInstanceOf(Date);
    expect((storedUser?.lockedUntil as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it('atomically claims concurrent MFA attempts and consumes the challenge at the limit', async () => {
    if (!app) {
      throw new Error('Integration API was not initialized.');
    }

    const server = app.getHttpServer();
    const connection = app.get<Connection>(getConnectionToken());
    const email = `concurrent-mfa-${randomUUID()}@integration.test`;
    await request(server)
      .post('/api/auth/register')
      .send({ email, password: 'ConcurrentMfa123!' })
      .expect(201);

    const encodedKey = process.env.MFA_ENCRYPTION_KEY_BASE64;
    if (!encodedKey) {
      throw new Error('MFA integration key was not configured.');
    }
    const mfaCrypto = new MfaCryptoService();
    const secret = mfaCrypto.generateSecret();
    await connection.db?.collection('users').updateOne(
      { email },
      {
        $set: {
          mfaEnabled: true,
          mfaSecretEncrypted: mfaCrypto.encrypt(secret, Buffer.from(encodedKey, 'base64')),
        },
      },
    );

    const login = await request(server)
      .post('/api/auth/login')
      .send({ email, password: 'ConcurrentMfa123!' })
      .expect(200);
    const challengeToken = login.body.challengeToken as string;
    expect(login.body.mfaRequired).toBe(true);
    expect(challengeToken).toEqual(expect.any(String));

    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        request(server).post('/api/auth/login/mfa').send({ challengeToken, code: '000000' }),
      ),
    );
    expect(responses.every((response) => [401, 429].includes(response.status))).toBe(true);
    expect(responses.filter((response) => response.status === 401)).toHaveLength(5);

    const challengeHash = createHash('sha256').update(challengeToken).digest('hex');
    const storedChallenge = await connection.db
      ?.collection('mfa_challenges')
      .findOne({ tokenHash: challengeHash });
    expect(storedChallenge?.attempts).toBe(5);
    expect(storedChallenge?.usedAt).toBeInstanceOf(Date);
  });

  it('requires the current password for MFA setup and confirmation', async () => {
    if (!app) {
      throw new Error('Integration API was not initialized.');
    }

    const server = app.getHttpServer();
    const email = `mfa-step-up-${randomUUID()}@integration.test`;
    const password = 'MfaStepUp123!';
    const registration = await request(server)
      .post('/api/auth/register')
      .send({ email, password })
      .expect(201);
    const accessToken = registration.body.accessToken as string;

    await request(server)
      .post('/api/auth/mfa/setup')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ password: 'WrongPassword123!' })
      .expect(401);

    const setup = await request(server)
      .post('/api/auth/mfa/setup')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ password })
      .expect(201);
    expect(setup.body.secret).toEqual(expect.any(String));

    await request(server)
      .post('/api/auth/mfa/verify-setup')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ password: 'WrongPassword123!', code: '000000' })
      .expect(401);
  });

  it('persists auth, tickets and GridFS files and processes BullMQ work', async () => {
    if (!app) {
      throw new Error('Integration API was not initialized.');
    }
    const server = app.getHttpServer();
    const userAgent = request.agent(server);

    const registration = await userAgent
      .post('/api/auth/register')
      .send({ email: USER_EMAIL, password: USER_PASSWORD })
      .expect(201);
    expect(registration.body.accessToken).toEqual(expect.any(String));
    expect(registration.body.csrfToken).toEqual(expect.any(String));

    const refresh = await userAgent
      .post('/api/auth/refresh')
      .set('Origin', TEST_ORIGIN)
      .set('x-csrf-token', registration.body.csrfToken as string)
      .expect(200);
    const userAccessToken = refresh.body.accessToken as string;

    await request(server)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${userAccessToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.email).toBe(USER_EMAIL);
      });

    const createdTicket = await request(server)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${userAccessToken}`)
      .send({
        subject: 'Integration lifecycle verification',
        description: 'Validate MongoDB, GridFS, Redis and BullMQ together.',
      })
      .expect(201);
    const ticketId = resourceId(createdTicket.body as Record<string, unknown>);

    const ticketList = await request(server)
      .get('/api/tickets?page=1&limit=20')
      .set('Authorization', `Bearer ${userAccessToken}`)
      .expect(200);
    expect(ticketList.body.items).toHaveLength(1);
    expect(ticketList.body.items[0].number).toMatch(/^SD-\d{6}$/);
    if (!redisClient) {
      throw new Error('Integration Redis client was not initialized.');
    }
    const firstCacheVersion = Number(await redisClient.get('cache-version:tickets'));
    expect(firstCacheVersion).toBeGreaterThan(0);
    expect(await redisClient.keys(`tickets:v${firstCacheVersion}:*`)).toHaveLength(1);

    const cachedTicketList = await request(server)
      .get('/api/tickets?page=1&limit=20')
      .set('Authorization', `Bearer ${userAccessToken}`)
      .expect(200);
    expect(cachedTicketList.body).toEqual(ticketList.body);

    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );
    const [uploadedAttachment, duplicateAttachment] = await Promise.all([
      request(server)
        .post(`/api/tickets/${ticketId}/attachments`)
        .set('Authorization', `Bearer ${userAccessToken}`)
        .attach('file', png, {
          filename: 'integration-evidence.png',
          contentType: 'image/png',
        })
        .expect(201),
      request(server)
        .post(`/api/tickets/${ticketId}/attachments`)
        .set('Authorization', `Bearer ${userAccessToken}`)
        .attach('file', png, {
          filename: 'integration-evidence.png',
          contentType: 'image/png',
        })
        .expect(201),
    ]);
    const attachmentId = resourceId(uploadedAttachment.body as Record<string, unknown>);
    expect(resourceId(duplicateAttachment.body as Record<string, unknown>)).toBe(attachmentId);

    const attachmentList = await request(server)
      .get(`/api/tickets/${ticketId}/attachments?page=1&limit=20`)
      .set('Authorization', `Bearer ${userAccessToken}`)
      .expect(200);
    expect(attachmentList.body.pagination.total).toBe(1);

    const attachmentDownload = await request(server)
      .get(`/api/attachments/${attachmentId}/content`)
      .set('Authorization', `Bearer ${userAccessToken}`)
      .expect('Content-Type', /image\/png/)
      .expect('X-Content-Type-Options', 'nosniff')
      .expect(200);
    expect(Buffer.compare(Buffer.from(attachmentDownload.body as Buffer), png)).toBe(0);

    const connection = app.get<Connection>(getConnectionToken());
    expect(
      await connection.db?.collection('attachments.files').countDocuments({
        'metadata.ticketId': ticketId,
      }),
    ).toBe(1);

    await request(server)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${userAccessToken}`)
      .send({
        subject: 'Cache invalidation verification',
        description: 'A source-of-truth mutation must advance the cache namespace.',
      })
      .expect(201);
    const invalidatedCacheVersion = Number(await redisClient.get('cache-version:tickets'));
    expect(invalidatedCacheVersion).toBeGreaterThan(firstCacheVersion);
    const refreshedTicketList = await request(server)
      .get('/api/tickets?page=1&limit=20')
      .set('Authorization', `Bearer ${userAccessToken}`)
      .expect(200);
    expect(refreshedTicketList.body.items).toHaveLength(2);
    expect(await redisClient.keys(`tickets:v${invalidatedCacheVersion}:*`)).toHaveLength(1);

    const deliveredNotifications = await eventually(
      async () => {
        const response = await request(server)
          .get('/api/notifications?page=1&limit=20')
          .set('Authorization', `Bearer ${userAccessToken}`)
          .timeout({ response: 2_000, deadline: 5_000 })
          .expect(200);
        return response.body.items as Array<Record<string, unknown>>;
      },
      (items) => items.some((item) => item.deliveryStatus === 'DELIVERED'),
    );
    expect(deliveredNotifications.length).toBeGreaterThan(0);

    const queuedReport = await request(server)
      .post('/api/reports/tickets')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ maxRows: 100 })
      .expect(202);
    const reportId = resourceId(queuedReport.body as Record<string, unknown>);

    const completedReport = await eventually(
      async () => {
        const response = await request(server)
          .get(`/api/reports/${reportId}`)
          .set('Authorization', `Bearer ${adminAccessToken}`)
          .timeout({ response: 2_000, deadline: 5_000 })
          .expect(200);
        return response.body as Record<string, unknown>;
      },
      (report) => report.status === 'COMPLETED',
      30_000,
    );
    expect(completedReport.fileId).toEqual(expect.any(String));

    const pdf = await request(server)
      .get(`/api/reports/${reportId}/content`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .buffer(true)
      .expect('Content-Type', /application\/pdf/)
      .expect('X-Content-Type-Options', 'nosniff')
      .expect(200);
    expect(
      Buffer.from(pdf.body as Buffer)
        .subarray(0, 5)
        .toString(),
    ).toBe('%PDF-');
  }, 60_000);

  it('recovers a durable report after its Redis job is lost', async () => {
    if (!app || !workerContext) {
      throw new Error('Integration runtime was not initialized.');
    }
    const server = app.getHttpServer();
    await workerContext.close();
    workerContext = undefined;
    try {
      const queuedReport = await request(server)
        .post('/api/reports/tickets')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ maxRows: 25 })
        .expect(202);
      const reportId = resourceId(queuedReport.body as Record<string, unknown>);
      const reportsQueue = app.get<Queue>(getQueueToken(REPORTS_QUEUE));
      const jobId = `report-${reportId}`;
      const queuedJob = await reportsQueue.getJob(jobId);
      expect(queuedJob).toBeDefined();
      await queuedJob?.remove();
      expect(await reportsQueue.getJob(jobId)).toBeUndefined();

      await request(server)
        .get(`/api/reports/${reportId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200)
        .expect((response) => expect(response.body.status).toBe('QUEUED'));

      const { createWorkerContext } = await import('../../src/worker');
      workerContext = await createWorkerContext();

      const completedReport = await eventually(
        async () => {
          const response = await request(server)
            .get(`/api/reports/${reportId}`)
            .set('Authorization', `Bearer ${adminAccessToken}`)
            .timeout({ response: 2_000, deadline: 5_000 })
            .expect(200);
          return response.body as Record<string, unknown>;
        },
        (report) => report.status === 'COMPLETED',
        30_000,
      );
      expect(completedReport.fileId).toEqual(expect.any(String));
      const connection = app.get<Connection>(getConnectionToken());
      expect(
        await connection.db?.collection('reports.files').countDocuments({
          'metadata.reportId': reportId,
        }),
      ).toBe(1);
    } finally {
      if (!workerContext) {
        const { createWorkerContext } = await import('../../src/worker');
        workerContext = await createWorkerContext();
      }
    }
  }, 60_000);

  it('captures an exhausted BullMQ failure in the durable dead-letter collection', async () => {
    if (!app) {
      throw new Error('Integration API was not initialized.');
    }
    const server = app.getHttpServer();
    const notificationsQueue = app.get<Queue>(getQueueToken(NOTIFICATIONS_QUEUE));
    const jobId = `integration-dead-letter-${randomUUID()}`;
    const missingNotificationId = randomUUID().replaceAll('-', '').slice(0, 24);

    await notificationsQueue.add(
      'deliver-internal',
      { notificationId: missingNotificationId },
      {
        jobId,
        attempts: 3,
        backoff: { type: 'fixed', delay: 50 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    const failures = await eventually(
      async () => {
        const response = await request(server)
          .get('/api/admin/job-failures?page=1&limit=100')
          .set('Authorization', `Bearer ${adminAccessToken}`)
          .timeout({ response: 2_000, deadline: 5_000 })
          .expect(200);
        return response.body.items as Array<Record<string, unknown>>;
      },
      (items) => items.some((item) => item.jobId === jobId),
      20_000,
    );
    const captured = failures.find((item) => item.jobId === jobId);
    expect(captured).toMatchObject({
      queue: NOTIFICATIONS_QUEUE,
      jobId,
      status: 'DEAD_LETTER',
      attemptsMade: 3,
    });
  }, 30_000);

  it('starts the compiled API and worker entrypoints and stops them on SIGTERM', async () => {
    await app?.close();
    app = undefined;
    await workerContext?.close();
    workerContext = undefined;

    const port = await findAvailablePort();
    const childEnvironment = { ...process.env, PORT: String(port) };
    const apiProcess = spawn(process.execPath, [join(process.cwd(), 'dist', 'main.js')], {
      cwd: process.cwd(),
      env: childEnvironment,
    });
    let workerProcess: ChildProcessWithoutNullStreams | undefined;
    let apiOutput = '';
    let workerOutput = '';
    apiProcess.stdout.on('data', (chunk: Buffer) => {
      apiOutput = `${apiOutput}${chunk.toString()}`.slice(-20_000);
    });
    apiProcess.stderr.on('data', (chunk: Buffer) => {
      apiOutput = `${apiOutput}${chunk.toString()}`.slice(-20_000);
    });
    try {
      let health: number;
      try {
        health = await eventually(
          async () => {
            try {
              const response = await fetch(`http://127.0.0.1:${port}/api/health/ready`, {
                signal: AbortSignal.timeout(2_000),
              });
              return response.status;
            } catch {
              return 0;
            }
          },
          (status) => status === 200,
          60_000,
        );
      } catch (error) {
        throw new Error(`Compiled API did not become ready. Output: ${apiOutput}`, {
          cause: error,
        });
      }
      expect(health).toBe(200);

      workerProcess = spawn(process.execPath, [join(process.cwd(), 'dist', 'worker.js')], {
        cwd: process.cwd(),
        env: childEnvironment,
      });
      workerProcess.stdout.on('data', (chunk: Buffer) => {
        workerOutput = `${workerOutput}${chunk.toString()}`.slice(-20_000);
      });
      workerProcess.stderr.on('data', (chunk: Buffer) => {
        workerOutput = `${workerOutput}${chunk.toString()}`.slice(-20_000);
      });
      await eventually(
        async () => workerOutput,
        (output) => output.includes('QueueRecoveryModule dependencies initialized'),
        60_000,
      );
    } finally {
      const shutdownResults = await Promise.allSettled([
        stopChildProcess(apiProcess),
        workerProcess ? stopChildProcess(workerProcess) : Promise.resolve(),
      ]);
      const shutdownFailures = shutdownResults
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map((result) => result.reason as unknown);
      if (shutdownFailures.length > 0) {
        throw new AggregateError(shutdownFailures, 'Compiled processes did not stop cleanly.');
      }
    }

    expect(apiOutput).not.toContain('ApiBootstrap');
    expect(workerOutput).not.toContain('WorkerBootstrap');
  }, 150_000);
});
