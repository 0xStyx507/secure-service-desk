import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.types';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { ListCommentsDto } from './dto/list-comments.dto';
import { ListTicketsDto } from './dto/list-tickets.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { TicketCommentDocument } from './schemas/ticket-comment.schema';
import { TicketDocument } from './schemas/ticket.schema';
import { TicketCommandService } from './ticket-command.service';
import { TicketCommentsService } from './ticket-comments.service';
import { TicketsQueryService, PaginatedTickets } from './tickets-query.service';

export type { PaginatedTickets } from './tickets-query.service';

@Injectable()
export class TicketsService {
  constructor(
    private readonly queryService: TicketsQueryService,
    private readonly commandService: TicketCommandService,
    private readonly commentsService: TicketCommentsService,
  ) {}

  create(dto: CreateTicketDto, actor: AuthenticatedUser): Promise<TicketDocument> {
    return this.commandService.create(dto, actor);
  }

  list(query: ListTicketsDto, actor: AuthenticatedUser): Promise<PaginatedTickets> {
    return this.queryService.list(query, actor);
  }

  findOne(id: string, actor: AuthenticatedUser): Promise<TicketDocument> {
    return this.queryService.findOne(id, actor);
  }

  update(id: string, dto: UpdateTicketDto, actor: AuthenticatedUser): Promise<TicketDocument> {
    return this.commandService.update(id, dto, actor);
  }

  addComment(
    ticketId: string,
    dto: CreateCommentDto,
    actor: AuthenticatedUser,
  ): Promise<TicketCommentDocument> {
    return this.commentsService.addComment(ticketId, dto, actor);
  }

  validateComment(
    ticketId: string,
    dto: CreateCommentDto,
    actor: AuthenticatedUser,
  ): Promise<void> {
    return this.commentsService.validateComment(ticketId, dto, actor);
  }

  listComments(ticketId: string, actor: AuthenticatedUser, query: ListCommentsDto) {
    return this.queryService.listComments(ticketId, actor, query);
  }

  addWatcher(
    ticketId: string,
    watcherId: string,
    actor: AuthenticatedUser,
  ): Promise<TicketDocument> {
    return this.commandService.addWatcher(ticketId, watcherId, actor);
  }

  removeWatcher(
    ticketId: string,
    watcherId: string,
    actor: AuthenticatedUser,
  ): Promise<TicketDocument> {
    return this.commandService.removeWatcher(ticketId, watcherId, actor);
  }

  assertCanModifyContent(ticket: TicketDocument): void {
    return this.commandService.assertCanModifyContent(ticket);
  }
}
