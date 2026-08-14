import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.types';
import type { CreateNotification } from '../notifications/notifications.service';
import { CommentVisibility } from './comment-visibility.enum';
import { TicketDocument } from './schemas/ticket.schema';

export interface TicketChangeSummary {
  assigneeChanged: boolean;
  statusChanged: boolean;
  priorityChanged: boolean;
}

@Injectable()
export class TicketNotificationPolicy {
  buildUpdateNotifications(
    ticket: TicketDocument,
    actor: AuthenticatedUser,
    changes: TicketChangeSummary,
  ): CreateNotification[] {
    const notifications = new Map<string, CreateNotification>();
    const add = (input: CreateNotification): void => {
      if (input.userId !== actor.sub && !notifications.has(input.userId)) {
        notifications.set(input.userId, input);
      }
    };
    const relevantChange =
      changes.assigneeChanged || changes.statusChanged || changes.priorityChanged;

    if (changes.assigneeChanged && ticket.assigneeId) {
      add({
        userId: ticket.assigneeId.toString(),
        type: 'TICKET_ASSIGNED',
        title: `${ticket.number} assigned to you`,
        message: 'A support ticket is now assigned to you.',
        resourceType: 'ticket',
        resourceId: ticket.id,
      });
    }
    if (relevantChange) {
      add({
        userId: ticket.requesterId.toString(),
        type: 'TICKET_UPDATED',
        title: `${ticket.number} updated`,
        message: 'Your support request has new workflow information.',
        resourceType: 'ticket',
        resourceId: ticket.id,
      });
      for (const watcherId of ticket.watcherIds ?? []) {
        add({
          userId: watcherId.toString(),
          type: 'TICKET_UPDATED',
          title: `${ticket.number} updated`,
          message: 'A ticket you watch has new workflow information.',
          resourceType: 'ticket',
          resourceId: ticket.id,
        });
      }
    }
    return [...notifications.values()];
  }

  buildCommentRecipients(
    ticket: TicketDocument,
    actor: AuthenticatedUser,
    visibility: CommentVisibility,
  ): string[] {
    const recipients = new Set<string>();
    if (visibility === CommentVisibility.PUBLIC) {
      recipients.add(ticket.requesterId.toString());
      for (const watcherId of ticket.watcherIds ?? []) {
        recipients.add(watcherId.toString());
      }
    }
    if (ticket.assigneeId) {
      recipients.add(ticket.assigneeId.toString());
    }
    recipients.delete(actor.sub);
    return [...recipients];
  }
}
