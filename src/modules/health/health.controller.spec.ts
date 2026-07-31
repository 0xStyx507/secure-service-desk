import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const cacheUp = { ping: jest.fn().mockResolvedValue(true) };
  const cacheDown = { ping: jest.fn().mockResolvedValue(false) };

  it('reports live status without a database dependency', () => {
    const controller = new HealthController({ readyState: 0 } as never, cacheDown as never);

    expect(controller.live()).toEqual({ status: 'ok' });
  });

  it('reports readiness when MongoDB and Redis are connected', async () => {
    const controller = new HealthController({ readyState: 1 } as never, cacheUp as never);

    await expect(controller.ready()).resolves.toEqual({
      status: 'ready',
      dependencies: { mongodb: 'up', redis: 'up' },
    });
  });

  it('fails readiness when MongoDB is unavailable', async () => {
    const controller = new HealthController({ readyState: 0 } as never, cacheUp as never);

    await expect(controller.ready()).rejects.toThrow(ServiceUnavailableException);
  });

  it('fails readiness when Redis is unavailable', async () => {
    const controller = new HealthController({ readyState: 1 } as never, cacheDown as never);

    await expect(controller.ready()).rejects.toThrow(ServiceUnavailableException);
  });
});
