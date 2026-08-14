import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureHttpApp } from '../src/main';
import { JwtAuthGuard } from '../src/modules/auth/jwt-auth.guard';
import { MfaController } from '../src/modules/auth/mfa.controller';
import { MfaService } from '../src/modules/auth/mfa.service';

describe('MFA step-up HTTP contract (e2e)', () => {
  let app: INestApplication;
  const mfaService = {
    setup: jest.fn().mockResolvedValue({ secret: 'SECRET', otpauthUri: 'otpauth://totp/demo' }),
    verifySetup: jest.fn().mockResolvedValue(undefined),
    disable: jest.fn().mockResolvedValue(undefined),
    status: jest.fn().mockResolvedValue({ enabled: false }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MfaController],
      providers: [{ provide: MfaService, useValue: mfaService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: { switchToHttp: () => { getRequest: () => unknown } }) => {
          const request = context.switchToHttp().getRequest() as { user: { sub: string } };
          request.user = { sub: 'user-id' };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    configureHttpApp(app, new ConfigService({ corsOrigins: [] }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('requires the current password to start MFA setup', async () => {
    await request(app.getHttpServer()).post('/api/auth/mfa/setup').send({}).expect(400);

    await request(app.getHttpServer())
      .post('/api/auth/mfa/setup')
      .send({ password: 'CurrentPassword123!' })
      .expect(201);

    expect(mfaService.setup).toHaveBeenCalledWith('user-id', 'CurrentPassword123!');
  });

  it('requires the current password and TOTP code to confirm MFA setup', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/mfa/verify-setup')
      .send({ code: '123456' })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/auth/mfa/verify-setup')
      .send({ password: 'CurrentPassword123!', code: '123456' })
      .expect(204);

    expect(mfaService.verifySetup).toHaveBeenCalledWith('user-id', 'CurrentPassword123!', '123456');
  });
});
