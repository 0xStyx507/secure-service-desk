import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AuthenticatedUser } from '../auth/auth.types';
import { Role } from '../auth/roles.enum';
import { CommentVisibility } from './comment-visibility.enum';
import { TicketDocument } from './schemas/ticket.schema';
import { TicketAccessService } from './ticket-access.service';

describe('TicketAccessService', () => {
  const requesterId = new Types.ObjectId();
  const strangerId = new Types.ObjectId();
  const ticket = {
    requesterId,
    watcherIds: [],
  } as unknown as TicketDocument;
  const service = new TicketAccessService();

  it('allows a requester to read their own ticket', () => {
    const user: AuthenticatedUser = {
      sub: requesterId.toString(),
      email: 'requester@example.com',
      roles: [Role.USER],
      authzVersion: 0,
    };

    expect(() => service.assertCanRead(user, ticket)).not.toThrow();
  });

  it('blocks another user from reading the ticket', () => {
    const user: AuthenticatedUser = {
      sub: strangerId.toString(),
      email: 'stranger@example.com',
      roles: [Role.USER],
      authzVersion: 0,
    };

    expect(() => service.assertCanRead(user, ticket)).toThrow(ForbiddenException);
  });

  it('blocks internal comments from requesters', () => {
    const user: AuthenticatedUser = {
      sub: requesterId.toString(),
      email: 'requester@example.com',
      roles: [Role.USER],
      authzVersion: 0,
    };

    expect(() => service.assertCanCreateComment(user, ticket, CommentVisibility.INTERNAL)).toThrow(
      ForbiddenException,
    );
  });

  it('allows support staff to read and add internal comments', () => {
    const support: AuthenticatedUser = {
      sub: strangerId.toString(),
      email: 'support@example.com',
      roles: [Role.SUPPORT],
      authzVersion: 0,
    };

    expect(() => service.assertCanRead(support, ticket)).not.toThrow();
    expect(() =>
      service.assertCanCreateComment(support, ticket, CommentVisibility.INTERNAL),
    ).not.toThrow();
  });

  it('rejects content mutations on closed tickets', () => {
    expect(() =>
      service.assertCanModifyContent({
        ...ticket,
        status: 'CLOSED',
      } as unknown as TicketDocument),
    ).toThrow(ConflictException);
  });
});
