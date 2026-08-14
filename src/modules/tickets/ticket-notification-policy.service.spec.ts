import { Types } from 'mongoose';
import { Role } from '../auth/roles.enum';
import { CommentVisibility } from './comment-visibility.enum';
import { TicketNotificationPolicy } from './ticket-notification-policy.service';
import type { TicketDocument } from './schemas/ticket.schema';

describe('TicketNotificationPolicy', () => {
  const requesterId = new Types.ObjectId();
  const assigneeId = new Types.ObjectId();
  const watcherId = new Types.ObjectId();
  const actor = {
    sub: new Types.ObjectId().toString(),
    email: 'support@example.com',
    roles: [Role.SUPPORT],
    authzVersion: 0,
  };
  const ticket = {
    id: 'ticket-1',
    number: 'SD-000001',
    requesterId,
    assigneeId,
    watcherIds: [watcherId],
  } as unknown as TicketDocument;
  const policy = new TicketNotificationPolicy();

  it('notifies assignee, requester and watchers without duplicates', () => {
    const notifications = policy.buildUpdateNotifications(ticket, actor, {
      assigneeChanged: true,
      statusChanged: true,
      priorityChanged: false,
    });

    expect(notifications.map((item) => item.userId)).toEqual([
      assigneeId.toString(),
      requesterId.toString(),
      watcherId.toString(),
    ]);
    expect(new Set(notifications.map((item) => item.userId)).size).toBe(3);
  });

  it('includes watchers for public comments but not internal notes', () => {
    expect(policy.buildCommentRecipients(ticket, actor, CommentVisibility.PUBLIC)).toEqual([
      requesterId.toString(),
      watcherId.toString(),
      assigneeId.toString(),
    ]);
    expect(policy.buildCommentRecipients(ticket, actor, CommentVisibility.INTERNAL)).toEqual([
      assigneeId.toString(),
    ]);
  });
});
