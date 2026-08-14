import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'node:crypto';
import { FilterQuery, Model, Types } from 'mongoose';
import { CacheService } from '../../infrastructure/cache/cache.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { CommentVisibility } from './comment-visibility.enum';
import { ListCommentsDto } from './dto/list-comments.dto';
import { ListTicketsDto } from './dto/list-tickets.dto';
import { TicketComment, TicketCommentDocument } from './schemas/ticket-comment.schema';
import { Ticket, TicketDocument } from './schemas/ticket.schema';
import { TicketAccessService } from './ticket-access.service';

export interface PaginatedTickets {
  items: Array<Record<string, unknown>>;
  pagination: { page: number; limit: number; total: number; pages: number };
}

@Injectable()
export class TicketsQueryService {
  constructor(
    @InjectModel(Ticket.name)
    private readonly ticketModel: Model<TicketDocument>,
    @InjectModel(TicketComment.name)
    private readonly commentModel: Model<TicketCommentDocument>,
    private readonly access: TicketAccessService,
    private readonly cacheService: CacheService,
  ) {}

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
    if (cached) return cached;

    const filter: FilterQuery<TicketDocument> = {};
    if (!this.access.canManage(actor)) {
      const actorId = new Types.ObjectId(actor.sub);
      filter.$or = [{ requesterId: actorId }, { watcherIds: actorId }];
    }
    if (query.status) filter.status = query.status;
    if (query.priority) filter.priority = query.priority;
    if (query.assigneeId) {
      filter.assigneeId = new Types.ObjectId(query.assigneeId);
    }
    if (query.search) filter.$text = { $search: query.search };

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
    const ticket = await this.ticketModel.findById(id).exec();
    if (!ticket) throw new NotFoundException('Ticket not found.');
    this.access.assertCanRead(actor, ticket);
    return ticket;
  }

  async listComments(ticketId: string, actor: AuthenticatedUser, query: ListCommentsDto) {
    const ticket = await this.findOne(ticketId, actor);
    const filter: FilterQuery<TicketCommentDocument> = { ticketId: ticket._id };
    if (!this.access.canManage(actor)) filter.visibility = CommentVisibility.PUBLIC;
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      this.commentModel.find(filter).sort({ createdAt: 1 }).skip(skip).limit(query.limit).exec(),
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
}
