import { ForbiddenException, Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { AuthenticatedUser } from '../auth/auth.types';
import { Role } from '../auth/roles.enum';
import { CommentVisibility } from './comment-visibility.enum';
import { TicketDocument } from './schemas/ticket.schema';

@Injectable()
export class TicketAccessService {
  canManage(user: AuthenticatedUser): boolean {
    return user.roles.includes(Role.ADMIN) || user.roles.includes(Role.SUPPORT);
  }

  assertCanRead(user: AuthenticatedUser, ticket: TicketDocument): void {
    if (this.canManage(user)) {
      return;
    }

    const isRequester = ticket.requesterId.toString() === user.sub;
    const isWatcher = ticket.watcherIds.some(
      (id: Types.ObjectId) => id.toString() === user.sub,
    );
    if (!isRequester && !isWatcher) {
      throw new ForbiddenException('You cannot access this ticket.');
    }
  }

  assertCanCreateComment(
    user: AuthenticatedUser,
    ticket: TicketDocument,
    visibility: CommentVisibility,
  ): void {
    this.assertCanRead(user, ticket);
    if (visibility === CommentVisibility.INTERNAL && !this.canManage(user)) {
      throw new ForbiddenException('Internal comments require support access.');
    }
  }
}
