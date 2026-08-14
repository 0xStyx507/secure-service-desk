import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import { CommentVisibility } from './comment-visibility.enum';
import { CreateCommentDto } from './dto/create-comment.dto';
import { TicketComment, TicketCommentDocument } from './schemas/ticket-comment.schema';
import { TicketAccessService } from './ticket-access.service';
import { TicketNotificationPolicy } from './ticket-notification-policy.service';
import { TicketsQueryService } from './tickets-query.service';

@Injectable()
export class TicketCommentsService {
  constructor(
    @InjectModel(TicketComment.name) private readonly commentModel: Model<TicketCommentDocument>,
    private readonly queryService: TicketsQueryService,
    private readonly access: TicketAccessService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly notificationPolicy: TicketNotificationPolicy,
  ) {}

  async addComment(
    ticketId: string,
    dto: CreateCommentDto,
    actor: AuthenticatedUser,
  ): Promise<TicketCommentDocument> {
    const ticket = await this.queryService.findOne(ticketId, actor);
    this.access.assertCanModifyContent(ticket);
    const visibility = dto.visibility ?? CommentVisibility.PUBLIC;
    this.access.assertCanCreateComment(actor, ticket, visibility);
    const comment = await this.commentModel.create({
      ticketId: ticket._id,
      authorId: new Types.ObjectId(actor.sub),
      body: dto.body,
      visibility,
    });
    const recipients = this.notificationPolicy.buildCommentRecipients(ticket, actor, visibility);
    await Promise.allSettled([
      this.auditService.record({
        actorId: actor.sub,
        action: 'TICKET_COMMENT_CREATED',
        resourceType: 'ticket',
        resourceId: ticket.id,
        metadata: { commentId: comment.id, visibility },
      }),
      this.notificationsService.createMany(
        recipients.map((userId) => ({
          userId,
          type: 'TICKET_COMMENT_CREATED',
          title: `${ticket.number} has a new comment`,
          message:
            visibility === CommentVisibility.INTERNAL
              ? 'A new internal note was added.'
              : 'A new public comment was added.',
          resourceType: 'ticket',
          resourceId: ticket.id,
        })),
      ),
    ]);
    return comment;
  }

  async validateComment(
    ticketId: string,
    dto: CreateCommentDto,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const ticket = await this.queryService.findOne(ticketId, actor);
    this.access.assertCanModifyContent(ticket);
    this.access.assertCanCreateComment(actor, ticket, dto.visibility ?? CommentVisibility.PUBLIC);
  }
}
