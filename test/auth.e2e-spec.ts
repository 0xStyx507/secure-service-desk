import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureHttpApp } from '../src/main';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';
import { CsrfService } from '../src/modules/auth/csrf.service';
import { JwtAuthGuard } from '../src/modules/auth/jwt-auth.guard';
import { JwtTokenService } from '../src/modules/auth/jwt-token.service';

describe('authentication HTTP contract (e2e)', () => {
  let app: INestApplication;
  const authService = {
    register: jest.fn(),
    login: jest.fn().mockResolvedValue({
      accessToken: 'signed-access-token',
      accessExpiresIn: 900,
      refreshToken: 'opaque-refresh-token',
      refreshExpiresIn: 604_800,
    }),
    refresh: jest.fn().mockResolvedValue({
      accessToken: 'rotated-access-token',
      accessExpiresIn: 900,
      refreshToken: 'rotated-refresh-token',
      refreshExpiresIn: 604_800,
    }),
    logout: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        CsrfService,
        {
          provide: ConfigService,
          useValue: new ConfigService({
            refreshCookieName: 'service_desk_refresh',
            csrfCookieName: 'service_desk_csrf',
            cookieSecure: false,
            corsOrigins: ['https://portfolio.example'],
          }),
        },
        { provide: AuthService, useValue: authService },
        { provide: JwtTokenService, useValue: { getPublicJwks: jest.fn() } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    configureHttpApp(
      app,
      new ConfigService({ corsOrigins: ['https://portfolio.example'] }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('keeps the refresh value out of the JSON body and sets an HttpOnly cookie', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'StrongPassword123' })
      .expect(200);

    expect(response.body).toMatchObject({
      accessToken: 'signed-access-token',
      tokenType: 'Bearer',
      expiresIn: 900,
    });
    expect(response.body).not.toHaveProperty('refreshToken');
    const cookies = response.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((cookie) => cookie.includes('HttpOnly'))).toBe(true);
    expect(cookies.every((cookie) => cookie.includes('SameSite=Strict'))).toBe(true);
  });

  it('rotates refresh only when the cookie and CSRF values match', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Origin', 'https://portfolio.example')
      .set('Cookie', [
        'service_desk_refresh=opaque-refresh-token',
        'service_desk_csrf=csrf-value',
      ])
      .set('x-csrf-token', 'csrf-value')
      .expect(200);

    expect(response.body.accessToken).toBe('rotated-access-token');
    expect(authService.refresh).toHaveBeenCalledWith('opaque-refresh-token');
  });

  it('rejects an untrusted browser origin', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Origin', 'https://evil.example')
      .set('Cookie', [
        'service_desk_refresh=opaque-refresh-token',
        'service_desk_csrf=csrf-value',
      ])
      .set('x-csrf-token', 'csrf-value')
      .expect(401);
  });

  it('rejects duplicate authentication cookies', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set(
        'Cookie',
        'service_desk_refresh=one; service_desk_refresh=two; service_desk_csrf=csrf-value',
      )
      .set('x-csrf-token', 'csrf-value')
      .expect(401);
  });

  it('maps malformed cookie encoding to 401 instead of 500', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set(
        'Cookie',
        'service_desk_refresh=%E0%A4%A; service_desk_csrf=csrf-value',
      )
      .set('x-csrf-token', 'csrf-value')
      .expect(401);
  });
});
