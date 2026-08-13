import { ConfigService } from '@nestjs/config';
import { QueueRecoveryService } from './queue-recovery.service';

function queryResult(rows: unknown[]) {
  return {
    sort: () => ({
      limit: () => ({
        select: () => ({
          lean: () => ({
            exec: jest.fn().mockResolvedValue(rows),
          }),
        }),
        exec: jest.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

describe('QueueRecoveryService', () => {
  it('reports partial enqueue failures instead of treating the cycle as successful', async () => {
    const notificationModel = {
      find: jest.fn().mockReturnValue(queryResult([{ _id: 'notification-1' }])),
    };
    const reportModel = {
      find: jest.fn().mockReturnValue(queryResult([{ _id: 'report-1', requestedBy: 'actor-1' }])),
    };
    const outboxModel = {
      find: jest.fn().mockReturnValue(queryResult([])),
    };
    const notificationsQueue = {
      add: jest.fn().mockRejectedValue(new Error('Redis write failed')),
    };
    const reportsQueue = { add: jest.fn().mockResolvedValue({}) };
    const configService = { get: jest.fn() } as unknown as ConfigService;
    const outboxService = { markDispatched: jest.fn() };
    const service = new QueueRecoveryService(
      notificationModel as never,
      reportModel as never,
      outboxModel as never,
      notificationsQueue as never,
      reportsQueue as never,
      configService,
      outboxService as never,
    );

    await expect(service.recover()).rejects.toThrow(
      'Queue recovery failed to enqueue 1 pending job(s).',
    );
    expect(reportsQueue.add).toHaveBeenCalledTimes(1);
  });
});
