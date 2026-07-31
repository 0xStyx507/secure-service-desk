import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'node:crypto';
import { FilterQuery, Model, Types } from 'mongoose';
import { CacheService } from '../../infrastructure/cache/cache.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { Role } from '../auth/roles.enum';
import {
  CreateNotification,
  NotificationsService,
} from '../notifications/notifications.service';
import { UserStatus } from '../users/user-status.enum';
import { UsersService } from '../users/users.service';
import { CommentVisibility } from './comment-visibility.enum';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { ListTicketsDto } from './dto/list-tickets.dto';
import { ListCommentsDto } from './dto/list-comments.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import {
  TicketComment,
  TicketCommentDocument,
} from './schemas/ticket-comment.schema';
import { TicketCounter, TicketCounterDocument } from './schemas/ticket-counter.schema';
import { Ticket, TicketDocument } from './schemas/ticket.schema';
import { TicketAccessService } from './ticket-access.service';
import { TicketWorkflowService } from './ticket-workflow.service';
import { TicketStatus } from './ticket-status.enum';

export interface PaginatedTickets {
  items: Array<Record<string, unknown>>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

@Injectable()
export class TicketsService {
  constructor(
    @InjectModel(Ticket.name)
    private readonly ticketModel: Model<TicketDocument>,
    @InjectModel(TicketComment.name)
    private readonly commentModel: Model<TicketCommentDocument>,
    @InjectModel(TicketCounter.name)
    private readonly counterModel: Model<TicketCounterDocument>,
    private readonly usersService: UsersService,
    private readonly access: TicketAccessService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly cacheService: CacheService,
    private readonly workflow: TicketWorkflowService,
  ) {}

  async create(dto: CreateTicketDto, actor: AuthenticatedUser): Promise<TicketDocument> {
    const sequence = await this.counterModel
      .findOneAndUpdate(
        { key: 'ticket-number' },
        { $inc: { sequence: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();

    if (!sequence) {
      throw new ConflictException('Could not allocate a ticket number.');
    }

    const ticket = await this.ticketModel.create({
      number: `SD-${sequence.sequence.toString().padStart(6, '0')}`,
      subject: dto.subject,
      description: dto.description,
      requesterId: new Types.ObjectId(actor.sub),
    });
    await Promise.allSettled([
      this.auditService.record({
        actorId: actor.sub,
        action: 'TICKET_CREATED',
        resourceType: 'ticket',
        resourceId: ticket.id,
        metadata: { number: ticket.number },
      }),
      this.notificationsService.create({
        userId: actor.sub,
        type: 'TICKET_CREATED',
        title: `${ticket.number} created`,
        message: 'Your support request was registered.',
        resourceType: 'ticket',
        resourceId: ticket.id,
      }),
      this.cacheService.invalidate('tickets'),
    ]);
    return ticket;
  }

  async list(query: ListTicketsDto, actor: AuthenticatedUser): Promise<PaginatedTickets> {
    const version = await this.cacheService.getVersion('tickets');
    const scope = this.access.canManage(actor) ? 'support' : actor.sub;
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          scope,
          page: query.page,
          limit: query.limit,
          search: query.search ?? '',
          status: query.status ?? '',
          priority: query.priority ?? '',
          assigneeId: query.assigneeId ?? '',
        }),
      )
      .digest('hex');
    const cacheKey = `tickets:v${version}:${fingerprint}`;
    const cached = await this.cacheService.getJson<PaginatedTickets>(cacheKey);
    if (cached) {
      return cached;
    }

    const filter: FilterQuery<TicketDocument> = {};
    if (!this.access.canManage(actor)) {
      const actorId = new Types.ObjectId(actor.sub);
      filter.$or = [{ requesterId: actorId }, { watcherIds: actorId }];
    }
    if (query.status) {
      filter.status = query.status;
    }
    if (query.priority) {
      filter.priority = query.priority;
    }
    if (query.assigneeId) {
      filter.assigneeId = new Types.ObjectId(query.assigneeId);
    }
    if (query.search) {
      filter.$text = { $search: query.search };
    }

    const skip = (query.page - 1) * query.limit;
    const [documents, total] = await Promise.all([
      this.ticketModel
        .find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .lean()
        .exec(),
      this.ticketModel.countDocuments(filter).exec(),
    ]);

    const result: PaginatedTickets = {
      items: documents as unknown as Array<Record<string, unknown>>,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      },
    };
    await this.cacheService.setJson(cacheKey, result);
    return result;
  }

  async findOne(id: string, actor: AuthenticatedUser): Promise<TicketDocument> {
    const ticket = await this.findTicket(id);
    this.access.assertCanRead(actor, ticket);
    return ticket;
  }

  async update(
    id: string,
    dto: UpdateTicketDto,
    actor: AuthenticatedUser,
  ): Promise<TicketDocument> {
    const ticket = await this.findTicket(id);
    if (!this.access.canManage(actor)) {
      throw new BadRequestException('Only support staff can update ticket workflow.');
    }
    if (ticket.version !== dto.version) {
      throw new ConflictException('Ticket changed. Reload it before updating.');
    }

    const changedFields: string[] = [];
    if (dto.assigneeId !== undefined) {
      ticket.assigneeId = await this.resolveAssignee(dto.assigneeId);
      changedFields.push('assigneeId');
    }
    if (dto.status !== undefined) {
      this.workflow.assertTransition(ticket.status, dto.status);
      if (
        dto.status === TicketStatus.RESOLVED &&
        !(dto.resolution ?? ticket.resolution)
      ) {
        throw new BadRequestException('A resolution is required to resolve the ticket.');
      }
      ticket.status = dto.status;
      changedFields.push('status');
      if (dto.status === TicketStatus.RESOLVED) {
        ticket.resolvedAt = new Date();
      }
      if (dto.status === TicketStatus.CLOSED) {
        ticket.closedAt = new Date();
      }
      if (dto.status === TicketStatus.IN_PROGRESS) {
        ticket.resolvedAt = undefined;
        ticket.closedAt = undefined;
        ticket.resolution = undefined;
      }
    }
    if (dto.priority !== undefined) {
      ticket.priority = dto.priority;
      changedFields.push('priority');
    }
    if (dto.resolution !== undefined) {
      if (
        ticket.status !== TicketStatus.RESOLVED &&
        ticket.status !== TicketStatus.CLOSED
      ) {
        throw new BadRequestException(
          'A resolution can only be stored on a resolved or closed ticket.',
        );
      }
      ticket.resolution = dto.resolution;
      changedFields.push('resolution');
    }

    try {
      const updated = await ticket.save();
      const effects: Promise<unknown>[] = [
        this.auditService.record({
          actorId: actor.sub,
          action: 'TICKET_UPDATED',
          resourceType: 'ticket',
          resourceId: updated.id,
          metadata: {
            number: updated.number,
            changedFields,
            version: updated.version,
          },
        }),
      ];
      if (updated.requesterId.toString() !== actor.sub) {
        effects.push(
          this.notificationsService.create({
            userId: updated.requesterId.toString(),
            type: 'TICKET_UPDATED',
            title: `${updated.number} updated`,
            message: 'Your support request has new workflow information.',
            resourceType: 'ticket',
            resourceId: updated.id,
          }),
        );
      }
      await Promise.allSettled(effects);
      await this.cacheService.invalidate('tickets');
      return updated;
    } catch (error) {
      if (error instanceof Error && error.name === 'VersionError') {
        throw new ConflictException('Ticket changed. Reload it before updating.');
      }
      throw error;
    }
  }

  async addComment(
    ticketId: string,
    dto: CreateCommentDto,
    actor: AuthenticatedUser,
  ): Promise<TicketCommentDocument> {
    const ticket = await this.findTicket(ticketId);
    const visibility = dto.visibility ?? CommentVisibility.PUBLIC;
    this.access.assertCanCreateComment(actor, ticket, visibility);

    const comment = await this.commentModel.create({
      ticketId: ticket._id,
      authorId: new Types.ObjectId(actor.sub),
      body: dto.body,
      visibility,
    });
    const recipients = this.commentRecipients(ticket, actor, visibility);
    await Promise.allSettled([
      this.auditService.record({
        actorId: actor.sub,
        action: 'TICKET_COMMENT_CREATED',
        resourceType: 'ticket',
        resourceId: ticket.id,
        metadata: { commentId: comment.id, visibility },
      }),
      this.notificationsService.createMany(
        recipients.map<CreateNotification>((userId) => ({
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

  async listComments(
    ticketId: string,
    actor: AuthenticatedUser,
    query: ListCommentsDto,
  ) {
    const ticket = await this.findTicket(ticketId);
    this.access.assertCanRead(actor, ticket);
    const filter: FilterQuery<TicketCommentDocument> = { ticketId: ticket._id };
    if (!this.access.canManage(actor)) {
      filter.visibility = CommentVisibility.PUBLIC;
    }
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      this.commentModel
        .find(filter)
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(query.limit)
        .exec(),
      this.commentModel.countDocuments(filter).exec(),
    ]);
    return {
      items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      },
    };
  }

  private async findTicket(id: string): Promise<TicketDocument> {
    const ticket = await this.ticketModel.findById(id).exec();
    if (!ticket) {
      throw new NotFoundException('Ticket not found.');
    }
    return ticket;
  }

  private async resolveAssignee(assigneeId: string | null): Promise<Types.ObjectId | undefined> {
    if (assigneeId === null) {
      return undefined;
    }

    const assignee = await this.usersService.findById(assigneeId);
    const canSupport =
      assignee?.status === UserStatus.ACTIVE &&
      assignee.roles.some((role) => role === Role.SUPPORT || role === Role.ADMIN);
    if (!assignee || !canSupport) {
      throw new BadRequestException('Assignee must be an active support user.');
    }
    return new Types.ObjectId(assigneeId);
  }

  private commentRecipients(
    ticket: TicketDocument,
    actor: AuthenticatedUser,
    visibility: CommentVisibility,
  ): string[] {
    const recipients = new Set<string>();
    if (visibility === CommentVisibility.PUBLIC) {
      recipients.add(ticket.requesterId.toString());
    }
    if (ticket.assigneeId) {
      recipients.add(ticket.assigneeId.toString());
    }
    recipients.delete(actor.sub);
    return [...recipients];
  }
}
