import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import request from 'supertest';
import { configureHttpApp } from '../src/main';
import { JwtAuthGuard } from '../src/modules/auth/jwt-auth.guard';
import { JwtTokenService } from '../src/modules/auth/jwt-token.service';
import { Role } from '../src/modules/auth/roles.enum';
import { RolesGuard } from '../src/modules/auth/roles.guard';
import { TicketStatus } from '../src/modules/tickets/ticket-status.enum';
import { TicketsController } from '../src/modules/tickets/tickets.controller';
import { TicketsService } from '../src/modules/tickets/tickets.service';
import { UsersService } from '../src/modules/users/users.service';

describe('tickets HTTP contract (e2e)', () => {
  let app: INestApplication;
  const ticketId = new Types.ObjectId().toString();
  const ticket = {
    id: ticketId,
    number: 'SD-000001',
    subject: 'Cannot access portal',
    description: 'The portal rejects valid credentials.',
    status: TicketStatus.OPEN,
    version: 0,
  };
  const ticketsService = {
    create: jest.fn().mockResolvedValue(ticket),
    list: jest.fn().mockResolvedValue({
      items: [ticket],
      pagination: { page: 1, limit: 20, total: 1, pages: 1 },
    }),
    findOne: jest.fn().mockResolvedValue(ticket),
    update: jest.fn().mockResolvedValue({ ...ticket, status: TicketStatus.IN_PROGRESS }),
    addComment: jest.fn(),
    listComments: jest.fn(),
  };

  beforeAll(async () => {
    const jwtTokenService = {
      verifyAccessToken: jest.fn().mockImplementation((token: string) => {
        if (token !== 'support-token' && token !== 'user-token') {
          throw new UnauthorizedException('Invalid access token.');
        }
        return {
          sub: new Types.ObjectId().toString(),
          email: `${token}@example.com`,
          roles: [token === 'support-token' ? Role.SUPPORT : Role.USER],
          authzVersion: 0,
        };
      }),
    };
    const usersService = {
      findById: jest.fn().mockImplementation((_id: string) => ({
        email: 'current@example.com',
        roles: jwtTokenService.verifyAccessToken.mock.results.at(-1)?.value.roles,
        status: 'ACTIVE',
        authzVersion: 0,
      })),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [TicketsController],
      providers: [
        Reflector,
        JwtAuthGuard,
        RolesGuard,
        { provide: TicketsService, useValue: ticketsService },
        { provide: JwtTokenService, useValue: jwtTokenService },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    configureHttpApp(app, new ConfigService({ corsOrigins: [] }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('requires a bearer token', async () => {
    await request(app.getHttpServer()).get('/api/tickets').expect(401);
  });

  it('creates a ticket from a validated DTO', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/tickets')
      .set('Authorization', 'Bearer user-token')
      .send({
        subject: '  Cannot access portal  ',
        description: '  The portal rejects valid credentials.  ',
      })
      .expect(201);

    expect(response.body.number).toBe('SD-000001');
    expect(ticketsService.create).toHaveBeenCalledWith(
      {
        subject: 'Cannot access portal',
        description: 'The portal rejects valid credentials.',
      },
      expect.objectContaining({ roles: [Role.USER] }),
    );
  });

  it('rejects unknown request properties', async () => {
    await request(app.getHttpServer())
      .post('/api/tickets')
      .set('Authorization', 'Bearer user-token')
      .send({
        subject: 'Cannot access portal',
        description: 'The portal rejects valid credentials.',
        requesterId: new Types.ObjectId().toString(),
      })
      .expect(400);
  });

  it('rejects malformed resource identifiers before querying the service', async () => {
    await request(app.getHttpServer())
      .get('/api/tickets/not-an-object-id')
      .set('Authorization', 'Bearer user-token')
      .expect(400);
  });

  it('prevents a USER token from updating ticket workflow', async () => {
    await request(app.getHttpServer())
      .patch(`/api/tickets/${ticketId}`)
      .set('Authorization', 'Bearer user-token')
      .send({ version: 0, status: TicketStatus.IN_PROGRESS })
      .expect(403);
  });

  it('allows SUPPORT to update ticket workflow with a version', async () => {
    await request(app.getHttpServer())
      .patch(`/api/tickets/${ticketId}`)
      .set('Authorization', 'Bearer support-token')
      .send({ version: 0, status: TicketStatus.IN_PROGRESS })
      .expect(200);
  });
});
