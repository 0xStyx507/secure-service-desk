import { getQueueToken } from '@nestjs/bullmq';
import type { Type } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from '../src/app.controller';
import { AppModule } from '../src/app.module';
import { CacheService } from '../src/infrastructure/cache/cache.service';
import { AttachmentsController } from '../src/modules/attachments/attachments.controller';
import { AuthController } from '../src/modules/auth/auth.controller';
import { JwtAuthGuard } from '../src/modules/auth/jwt-auth.guard';
import { RolesGuard } from '../src/modules/auth/roles.guard';
import { GovernanceController } from '../src/modules/governance/governance.controller';
import { HealthController } from '../src/modules/health/health.controller';
import { DeadLetterService } from '../src/modules/jobs/dead-letter.service';
import { QueueRecoveryService } from '../src/modules/jobs/queue-recovery.service';
import { NotificationWorker } from '../src/modules/notifications/notification.worker';
import { NOTIFICATIONS_QUEUE } from '../src/modules/notifications/notifications.constants';
import { NotificationsController } from '../src/modules/notifications/notifications.controller';
import { ReportWorker } from '../src/modules/reports/report.worker';
import { REPORTS_QUEUE } from '../src/modules/reports/reports.constants';
import { ReportsController } from '../src/modules/reports/reports.controller';
import { TicketsController } from '../src/modules/tickets/tickets.controller';
import { WorkerAppModule } from '../src/worker-app.module';

const connectionStub = {
  models: {},
  model: jest.fn().mockImplementation(() => jest.fn()),
  readyState: 1,
  db: {},
  close: jest.fn(),
};

const notificationsQueueStub = {
  add: jest.fn(),
  getJob: jest.fn(),
};

const reportsQueueStub = {
  add: jest.fn(),
  getJob: jest.fn(),
};

const cacheStub = {
  getJson: jest.fn(),
  setJson: jest.fn(),
  getVersion: jest.fn(),
  invalidate: jest.fn(),
  ping: jest.fn(),
};

async function compileApplicationGraph(rootModule: Type<unknown>): Promise<TestingModule> {
  return Test.createTestingModule({ imports: [rootModule] })
    .overrideProvider(getConnectionToken())
    .useValue(connectionStub)
    .overrideProvider(getQueueToken(NOTIFICATIONS_QUEUE))
    .useValue(notificationsQueueStub)
    .overrideProvider(getQueueToken(REPORTS_QUEUE))
    .useValue(reportsQueueStub)
    .overrideProvider(CacheService)
    .useValue(cacheStub)
    .compile();
}

describe('Nest application composition (e2e)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('resolves the complete HTTP application graph without external connections', async () => {
    const moduleRef = await compileApplicationGraph(AppModule);
    try {
      expect(moduleRef.get(AppController)).toBeInstanceOf(AppController);
      expect(moduleRef.get(AuthController)).toBeInstanceOf(AuthController);
      expect(moduleRef.get(TicketsController)).toBeInstanceOf(TicketsController);
      expect(moduleRef.get(AttachmentsController)).toBeInstanceOf(AttachmentsController);
      expect(moduleRef.get(NotificationsController)).toBeInstanceOf(NotificationsController);
      expect(moduleRef.get(ReportsController)).toBeInstanceOf(ReportsController);
      expect(moduleRef.get(GovernanceController)).toBeInstanceOf(GovernanceController);
      expect(moduleRef.get(HealthController)).toBeInstanceOf(HealthController);
      expect(moduleRef.get(JwtAuthGuard)).toBeInstanceOf(JwtAuthGuard);
      expect(moduleRef.get(RolesGuard)).toBeInstanceOf(RolesGuard);
      expect(moduleRef.get(getQueueToken(NOTIFICATIONS_QUEUE))).toBe(notificationsQueueStub);
      expect(moduleRef.get(getQueueToken(REPORTS_QUEUE))).toBe(reportsQueueStub);
    } finally {
      await moduleRef.close();
    }
  });

  it('resolves workers and queue recovery without starting processors', async () => {
    const moduleRef = await compileApplicationGraph(WorkerAppModule);
    try {
      expect(moduleRef.get(NotificationWorker)).toBeInstanceOf(NotificationWorker);
      expect(moduleRef.get(ReportWorker)).toBeInstanceOf(ReportWorker);
      expect(moduleRef.get(QueueRecoveryService)).toBeInstanceOf(QueueRecoveryService);
      expect(moduleRef.get(DeadLetterService)).toBeInstanceOf(DeadLetterService);
      expect(moduleRef.get(getQueueToken(NOTIFICATIONS_QUEUE))).toBe(notificationsQueueStub);
      expect(moduleRef.get(getQueueToken(REPORTS_QUEUE))).toBe(reportsQueueStub);
    } finally {
      await moduleRef.close();
    }
  });
});
