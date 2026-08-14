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
import {
  McpPendingAction,
  McpPendingActionDocument,
} from '../governance/schemas/mcp-pending-action.schema';
import { McpActionStatus } from './mcp-action-status.enum';

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

  async prepareStatusChange(actor: AuthenticatedUser, ticketId: string, update: UpdateTicketDto) {
    const ticket = await this.ticketsService.findOne(ticketId, actor);
    if (!actor.roles.some((role) => role === 'ADMIN' || role === 'SUPPORT')) {
      throw new UnauthorizedException('Support access is required for workflow changes.');
    }
    if (ticket.version !== update.version) {
      throw new UnauthorizedException(
        'Ticket version is stale. Reload before preparing the action.',
      );
    }
    return this.prepare(actor, 'STATUS_CHANGE', { ticketId, ...update });
  }

  async confirm(actor: AuthenticatedUser, actionToken: string) {
    const action = await this.claimAction(actor, actionToken);
    await this.recordActionAudit(actor, action, 'MCP_ACTION_EXECUTING');
    try {
      const result = await this.executeAction(actor, action);
      await this.completeAction(actor, action);
      return this.sanitize(result);
    } catch (error) {
      await this.markFailed(action, actor, error);
      throw error;
    }
  }

  private async claimAction(actor: AuthenticatedUser, actionToken: string) {
    const now = new Date();
    const action = await this.actionModel
      .findOneAndUpdate(
        {
          tokenHash: this.hash(actionToken),
          userId: new Types.ObjectId(actor.sub),
          $or: [
            { status: McpActionStatus.PENDING },
            { status: { $exists: false }, confirmedAt: { $exists: false } },
          ],
          confirmedAt: { $exists: false },
          cancelledAt: { $exists: false },
          expiresAt: { $gt: now },
        },
        { $set: { status: McpActionStatus.EXECUTING, executingAt: now } },
        { new: true },
      )
      .select('+tokenHash')
      .exec();
    if (!action) throw new UnauthorizedException('Invalid, expired or already used action token.');
    return action;
  }

  private async executeAction(actor: AuthenticatedUser, action: McpPendingActionDocument) {
    if (action.actionType === 'TICKET_COMMENT') {
      return this.ticketsService.addComment(
        String(action.payload.ticketId),
        {
          body: String(action.payload.body),
          visibility: action.payload.visibility as CommentVisibility,
        } satisfies CreateCommentDto,
        actor,
      );
    }
    return this.ticketsService.update(
      String(action.payload.ticketId),
      action.payload as unknown as UpdateTicketDto,
      actor,
    );
  }

  private async completeAction(
    actor: AuthenticatedUser,
    action: McpPendingActionDocument,
  ): Promise<void> {
    await this.actionModel
      .updateOne(
        { _id: action._id, status: McpActionStatus.EXECUTING },
        { $set: { status: McpActionStatus.COMPLETED, completedAt: new Date() } },
      )
      .exec();
    await this.recordActionAudit(actor, action, 'MCP_ACTION_COMPLETED');
  }

  private async recordActionAudit(
    actor: AuthenticatedUser,
    action: McpPendingActionDocument,
    actionName: string,
  ): Promise<void> {
    await this.auditService.recordCritical({
      actorId: actor.sub,
      action: actionName,
      resourceType: 'mcp_action',
      resourceId: action.id,
      metadata: { actionType: action.actionType },
    });
  }

  async cancel(
    actor: AuthenticatedUser,
    actionToken: string,
  ): Promise<{ cancelled: true; status: McpActionStatus }> {
    const action = await this.actionModel
      .findOneAndUpdate(
        {
          tokenHash: this.hash(actionToken),
          userId: new Types.ObjectId(actor.sub),
          $or: [
            { status: McpActionStatus.PENDING },
            { status: { $exists: false }, confirmedAt: { $exists: false } },
          ],
          confirmedAt: { $exists: false },
          cancelledAt: { $exists: false },
          expiresAt: { $gt: new Date() },
        },
        { $set: { status: McpActionStatus.CANCELLED, cancelledAt: new Date() } },
        { new: true },
      )
      .select('+tokenHash')
      .exec();
    if (!action) throw new UnauthorizedException('Invalid, expired or already used action token.');
    await this.auditService.recordCritical({
      actorId: actor.sub,
      action: 'MCP_ACTION_CANCELLED',
      resourceType: 'mcp_action',
      resourceId: action.id,
      metadata: { actionType: action.actionType },
    });
    return { cancelled: true, status: McpActionStatus.CANCELLED };
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
      status: McpActionStatus.PENDING,
      expiresAt: new Date(Date.now() + this.ttlSeconds * 1_000),
    });
    await this.auditService.record({
      actorId: actor.sub,
      action: 'MCP_ACTION_PREPARED',
      resourceType: 'mcp_action',
      resourceId: action.id,
      metadata: { actionType, expiresIn: this.ttlSeconds },
    });
    return {
      actionToken,
      actionType,
      status: McpActionStatus.PENDING,
      expiresIn: this.ttlSeconds,
      confirmationRequired: true,
    };
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private async markFailed(
    action: McpPendingActionDocument,
    actor: AuthenticatedUser,
    error: unknown,
  ): Promise<void> {
    await this.actionModel
      .updateOne(
        { _id: action._id, status: McpActionStatus.EXECUTING },
        {
          $set: {
            status: McpActionStatus.FAILED,
            failedAt: new Date(),
            failureCode: this.safeFailureCode(error),
            failureMessage: 'MCP action execution failed.',
          },
        },
      )
      .exec();
    await this.auditService.recordCritical({
      actorId: actor.sub,
      action: 'MCP_ACTION_FAILED',
      resourceType: 'mcp_action',
      resourceId: action.id,
      metadata: { actionType: action.actionType, failureCode: this.safeFailureCode(error) },
    });
  }

  private safeFailureCode(error: unknown): string {
    if (!(error instanceof Error)) return 'UNKNOWN_ERROR';
    const normalized = error.name.replace(/[^A-Za-z0-9_]/g, '').slice(0, 64);
    return normalized || 'ACTION_ERROR';
  }

  private sanitize(value: unknown): Record<string, unknown> {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  }
}
