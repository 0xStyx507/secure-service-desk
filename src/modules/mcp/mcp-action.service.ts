import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes } from 'node:crypto';
import { Model, Types } from 'mongoose';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { CommentVisibility } from '../tickets/comment-visibility.enum';
import { CreateCommentDto } from '../tickets/dto/create-comment.dto';
import { UpdateTicketDto } from '../tickets/dto/update-ticket.dto';
import { TicketsService } from '../tickets/tickets.service';
import { McpPendingAction, McpPendingActionDocument } from '../governance/schemas/mcp-pending-action.schema';
import { TicketStatus } from '../tickets/ticket-status.enum';

type ActionPayload = Record<string, unknown>;

@Injectable()
export class McpActionService {
  private readonly ttlSeconds = 300;

  constructor(
    @InjectModel(McpPendingAction.name)
    private readonly actionModel: Model<McpPendingActionDocument>,
    private readonly ticketsService: TicketsService,
    private readonly auditService: AuditService,
  ) {}

  async prepareComment(
    actor: AuthenticatedUser,
    ticketId: string,
    body: string,
    visibility: CommentVisibility,
  ) {
    await this.ticketsService.validateComment(ticketId, { body, visibility }, actor);
    return this.prepare(actor, 'TICKET_COMMENT', { ticketId, body, visibility });
  }

  async prepareStatusChange(
    actor: AuthenticatedUser,
    ticketId: string,
    update: UpdateTicketDto,
  ) {
    const ticket = await this.ticketsService.findOne(ticketId, actor);
    if (!actor.roles.some((role) => role === 'ADMIN' || role === 'SUPPORT')) {
      throw new UnauthorizedException('Support access is required for workflow changes.');
    }
    if (ticket.version !== update.version) {
      throw new UnauthorizedException('Ticket version is stale. Reload before preparing the action.');
    }
    return this.prepare(actor, 'STATUS_CHANGE', { ticketId, ...update });
  }

  async confirm(actor: AuthenticatedUser, actionToken: string) {
    const action = await this.actionModel
      .findOneAndUpdate(
        {
          tokenHash: this.hash(actionToken),
          userId: new Types.ObjectId(actor.sub),
          confirmedAt: { $exists: false },
          cancelledAt: { $exists: false },
          expiresAt: { $gt: new Date() },
        },
        { $set: { confirmedAt: new Date() } },
        { new: true },
      )
      .select('+tokenHash')
      .exec();
    if (!action) throw new UnauthorizedException('Invalid, expired or already used action token.');

    const result = action.actionType === 'TICKET_COMMENT'
      ? await this.ticketsService.addComment(
        String(action.payload.ticketId),
        {
          body: String(action.payload.body),
          visibility: action.payload.visibility as CommentVisibility,
        } satisfies CreateCommentDto,
        actor,
      )
      : await this.ticketsService.update(
        String(action.payload.ticketId),
        action.payload as unknown as UpdateTicketDto,
        actor,
      );
    await this.auditService.record({
      actorId: actor.sub,
      action: 'MCP_ACTION_CONFIRMED',
      resourceType: 'mcp_action',
      resourceId: action.id,
      metadata: { actionType: action.actionType },
    }).catch(() => undefined);
    return this.sanitize(result);
  }

  async cancel(actor: AuthenticatedUser, actionToken: string): Promise<{ cancelled: true }> {
    const action = await this.actionModel.findOneAndUpdate(
      {
        tokenHash: this.hash(actionToken),
        userId: new Types.ObjectId(actor.sub),
        confirmedAt: { $exists: false },
        cancelledAt: { $exists: false },
        expiresAt: { $gt: new Date() },
      },
      { $set: { cancelledAt: new Date() } },
      { new: true },
    ).select('+tokenHash').exec();
    if (!action) throw new UnauthorizedException('Invalid, expired or already used action token.');
    await this.auditService.record({
      actorId: actor.sub,
      action: 'MCP_ACTION_CANCELLED',
      resourceType: 'mcp_action',
      resourceId: action.id,
      metadata: { actionType: action.actionType },
    }).catch(() => undefined);
    return { cancelled: true };
  }

  private async prepare(
    actor: AuthenticatedUser,
    actionType: 'TICKET_COMMENT' | 'STATUS_CHANGE',
    payload: ActionPayload,
  ) {
    const actionToken = randomBytes(32).toString('base64url');
    const action = await this.actionModel.create({
      userId: new Types.ObjectId(actor.sub),
      tokenHash: this.hash(actionToken),
      actionType,
      payload,
      expiresAt: new Date(Date.now() + this.ttlSeconds * 1_000),
    });
    await this.auditService.record({
      actorId: actor.sub,
      action: 'MCP_ACTION_PREPARED',
      resourceType: 'mcp_action',
      resourceId: action.id,
      metadata: { actionType, expiresIn: this.ttlSeconds },
    }).catch(() => undefined);
    return {
      actionToken,
      actionType,
      expiresIn: this.ttlSeconds,
      confirmationRequired: true,
    };
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private sanitize(value: unknown): Record<string, unknown> {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  }
}
