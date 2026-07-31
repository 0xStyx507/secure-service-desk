import { Test } from '@nestjs/testing';
import { AppController } from './app.controller';

describe('AppController', () => {
  it('returns stable service metadata', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();
    const controller = moduleRef.get(AppController);

    expect(controller.getMetadata()).toEqual({
      name: 'secure-service-desk-api',
      version: '0.1.0',
      status: 'running',
    });
  });
});
