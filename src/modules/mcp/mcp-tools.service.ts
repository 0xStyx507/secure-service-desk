import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { Role } from '../auth/roles.enum';
import { CommentVisibility } from '../tickets/comment-visibility.enum';
import { ListCommentsDto } from '../tickets/dto/list-comments.dto';
import { ListTicketsDto } from '../tickets/dto/list-tickets.dto';
import { UpdateTicketDto } from '../tickets/dto/update-ticket.dto';
import { TicketPriority } from '../tickets/ticket-priority.enum';
import { TicketStatus } from '../tickets/ticket-status.enum';
import { TicketsService } from '../tickets/tickets.service';
import { UsersService } from '../users/users.service';
import { KnowledgeBaseService } from './knowledge-base.service';
import { McpActionService } from './mcp-action.service';

@Injectable()
export class McpToolsService {
  constructor(
    private readonly ticketsService: TicketsService,
    private readonly usersService: UsersService,
    private readonly knowledgeBase: KnowledgeBaseService,
    private readonly actions: McpActionService,
    private readonly auditService: AuditService,
  ) {}

  async searchTickets(actor: AuthenticatedUser, input: z.infer<typeof searchTicketsSchema>) {
    const query = Object.assign(new ListTicketsDto(), input);
    const result = await this.ticketsService.list(query, actor);
    await this.auditTool(actor, 'MCP_TOOL_SEARCH_TICKETS', { resultCount: result.items.length });
    return result;
  }

  async getTicketDetails(actor: AuthenticatedUser, ticketId: string) {
    const ticket = await this.ticketsService.findOne(ticketId, actor);
    const comments = await this.ticketsService.listComments(ticketId, actor, new ListCommentsDto());
    await this.auditTool(actor, 'MCP_TOOL_GET_TICKET_DETAILS', { ticketId });
    return { ticket: this.sanitize(ticket), comments: this.sanitize(comments) };
  }

  async summarizeTicket(actor: AuthenticatedUser, ticketId: string) {
    const details = await this.getTicketDetails(actor, ticketId);
    const ticket = details.ticket as Record<string, unknown>;
    const comments = details.comments as Record<string, unknown>;
    return {
      ticketId,
      subject: ticket.subject,
      status: ticket.status,
      priority: ticket.priority,
      summary: `${String(ticket.subject)} is ${String(ticket.status)} with ${String(ticket.priority)} priority.`,
      latestComments: Array.isArray(comments.items) ? comments.items.slice(-3) : [],
    };
  }

  async searchKnowledgeBase(actor: AuthenticatedUser, query: string, limit: number) {
    const items = await this.knowledgeBase.search(query, limit);
    await this.auditTool(actor, 'MCP_TOOL_SEARCH_KNOWLEDGE_BASE', { resultCount: items.length });
    return { items };
  }

  async suggestPriority(actor: AuthenticatedUser, ticketId: string) {
    const ticket = await this.ticketsService.findOne(ticketId, actor);
    const text = `${ticket.subject} ${ticket.description}`.toLowerCase();
    const critical =
      /security breach|data loss|production down|ransomware|unauthorized access/.test(text);
    const high = /urgent|outage|cannot login|blocked|payment failed/.test(text);
    const priority = critical
      ? TicketPriority.CRITICAL
      : high
        ? TicketPriority.HIGH
        : TicketPriority.MEDIUM;
    const result = {
      ticketId,
      suggestedPriority: priority,
      currentPriority: ticket.priority,
      confidence: critical || high ? 'medium' : 'low',
    };
    await this.auditTool(actor, 'MCP_TOOL_SUGGEST_PRIORITY', {
      ticketId,
      suggestedPriority: priority,
    });
    return result;
  }

  async suggestAssignee(actor: AuthenticatedUser, ticketId: string) {
    const ticket = await this.ticketsService.findOne(ticketId, actor);
    const candidates = await this.usersService.findActiveSupportUsers();
    const recommended = candidates[0];
    const result = {
      ticketId,
      currentAssigneeId: ticket.assigneeId?.toString(),
      recommendedAssignee: recommended
        ? { id: recommended.id, email: recommended.email, roles: recommended.roles }
        : null,
      reason: recommended
        ? 'First active support candidate in deterministic email order.'
        : 'No active support candidate is available.',
    };
    await this.auditTool(actor, 'MCP_TOOL_SUGGEST_ASSIGNEE', {
      ticketId,
      hasRecommendation: Boolean(recommended),
    });
    return result;
  }

  prepareComment(actor: AuthenticatedUser, input: z.infer<typeof prepareCommentSchema>) {
    return this.actions.prepareComment(actor, input.ticketId, input.body, input.visibility);
  }

  prepareStatusChange(actor: AuthenticatedUser, input: z.infer<typeof prepareStatusChangeSchema>) {
    return this.actions.prepareStatusChange(actor, input.ticketId, input as UpdateTicketDto);
  }

  confirmAction(actor: AuthenticatedUser, actionToken: string) {
    return this.actions.confirm(actor, actionToken);
  }

  cancelAction(actor: AuthenticatedUser, actionToken: string) {
    return this.actions.cancel(actor, actionToken);
  }

  private async auditTool(
    actor: AuthenticatedUser,
    action: string,
    metadata: Record<string, unknown>,
  ) {
    await this.auditService
      .record({
        actorId: actor.sub,
        action,
        resourceType: 'mcp_tool',
        resourceId: actor.sub,
        metadata,
      })
      .catch(() => undefined);
  }

  private sanitize(value: unknown): unknown {
    return JSON.parse(JSON.stringify(value));
  }
}

export const searchTicketsSchema = z.object({
  page: z.number().int().min(1).max(10_000).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  search: z.string().min(1).max(100).optional(),
  status: z.nativeEnum(TicketStatus).optional(),
  priority: z.nativeEnum(TicketPriority).optional(),
  assigneeId: z
    .string()
    .regex(/^[a-f\d]{24}$/i)
    .optional(),
});

export const prepareCommentSchema = z.object({
  ticketId: z.string().regex(/^[a-f\d]{24}$/i),
  body: z.string().trim().min(1).max(10_000),
  visibility: z.nativeEnum(CommentVisibility).default(CommentVisibility.PUBLIC),
});

export const prepareStatusChangeSchema = z.object({
  ticketId: z.string().regex(/^[a-f\d]{24}$/i),
  version: z.number().int().min(0),
  status: z.nativeEnum(TicketStatus).optional(),
  priority: z.nativeEnum(TicketPriority).optional(),
  assigneeId: z
    .string()
    .regex(/^[a-f\d]{24}$/i)
    .nullable()
    .optional(),
  resolution: z.string().trim().min(5).max(5_000).optional(),
});

export const actionTokenSchema = z.object({ actionToken: z.string().min(32).max(128) });

export const mcpRoleSet = new Set<Role>([Role.ADMIN, Role.SUPPORT]);
