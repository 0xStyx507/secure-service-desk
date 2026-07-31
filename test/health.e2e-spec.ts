import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppController } from '../src/app.controller';
import { HealthController } from '../src/modules/health/health.controller';
import { CacheService } from '../src/infrastructure/cache/cache.service';

describe('health endpoints (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AppController, HealthController],
      providers: [
        { provide: 'DatabaseConnection', useValue: { readyState: 1 } },
        { provide: CacheService, useValue: { ping: jest.fn().mockResolvedValue(true) } },
      ],
    })
      .compile();

    app = await moduleRef.createNestApplication().init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves metadata through HTTP', async () => {
    await request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect({ name: 'secure-service-desk-api', version: '0.1.0', status: 'running' });
  });
});
