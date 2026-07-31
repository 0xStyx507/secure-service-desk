import { Body, Controller, INestApplication, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { IsString, MaxLength, MinLength } from 'class-validator';
import request from 'supertest';
import { configureHttpApp } from '../src/main';

class FoundationDto {
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  title!: string;
}

@Controller('test-foundation')
class TestFoundationController {
  @Post()
  create(@Body() body: FoundationDto): FoundationDto {
    return body;
  }
}

describe('HTTP foundation (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TestFoundationController],
    }).compile();

    app = moduleRef.createNestApplication();
    configureHttpApp(app, new ConfigService({ corsOrigins: ['https://portfolio.example'] }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts a valid DTO and returns a request id', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/test-foundation')
      .send({ title: 'Valid request' })
      .expect(201);

    expect(response.headers['x-request-id']).toEqual(expect.any(String));
    expect(response.body.title).toBe('Valid request');
  });

  it('rejects unknown fields without exposing implementation details', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/test-foundation')
      .send({ title: 'Valid request', internalField: 'must be rejected' })
      .expect(400);

    expect(response.body).toMatchObject({ status: 400, title: 'Request Error' });
    expect(response.body).not.toHaveProperty('stack');
    expect(response.headers['x-request-id']).toEqual(expect.any(String));
  });

  it('does not allow wildcard CORS for a disallowed origin', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/unknown')
      .set('Origin', 'https://blocked.example')
      .expect(404);

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });
});
