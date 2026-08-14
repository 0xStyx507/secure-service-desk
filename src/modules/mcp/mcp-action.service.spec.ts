import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import type { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { Role } from '../auth/roles.enum';
import type { TicketsService } from '../tickets/tickets.service';
import { McpActionStatus } from './mcp-action-status.enum';
import { McpActionService } from './mcp-action.service';
import type { McpPendingActionDocument } from '../governance/schemas/mcp-pending-action.schema';

function query(value: unknown) {
  return {
    select: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  };
}

function buildAction(actionType: 'TICKET_COMMENT' | 'STATUS_CHANGE' = 'STATUS_CHANGE') {
  return {
    _id: new Types.ObjectId(),
    id: new Types.ObjectId().toString(),
    actionType,
    payload:
      actionType === 'STATUS_CHANGE'
        ? { ticketId: new Types.ObjectId().toString(), version: 1 }
        : { ticketId: new Types.ObjectId().toString(), body: 'Comment', visibility: 'PUBLIC' },
  } as unknown as McpPendingActionDocument;
}

describe('McpActionService', () => {
  const actor: AuthenticatedUser = {
    sub: new Types.ObjectId().toString(),
    email: 'support@example.com',
    roles: [Role.SUPPORT],
    authzVersion: 0,
    issuer: 'issuer',
    audience: 'audience',
    tokenId: 'token-id',
  };

  it('atomically claims an action and rejects a concurrent second confirmation', async () => {
    const action = buildAction();
    const findOneAndUpdate = jest
      .fn()
      .mockReturnValueOnce(query(action))
      .mockReturnValueOnce(query(null));
    const updateOne = jest.fn().mockReturnValue(query({ modifiedCount: 1 }));
    const actionModel = {
      findOneAndUpdate,
      updateOne,
    } as unknown as Model<McpPendingActionDocument>;
    const ticketsService = {
      update: jest.fn().mockResolvedValue({ id: 'ticket-1' }),
    } as unknown as TicketsService;
    const auditService = {
      record: jest.fn().mockResolvedValue(undefined),
      recordCritical: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditService;
    const service = new McpActionService(actionModel, ticketsService, auditService);

    await expect(service.confirm(actor, 'opaque-action-token')).resolves.toEqual({
      id: 'ticket-1',
    });
    await expect(service.confirm(actor, 'opaque-action-token')).rejects.toThrow(
      'Invalid, expired or already used action token.',
    );

    expect(findOneAndUpdate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        userId: expect.any(Types.ObjectId),
        $or: [
          { status: McpActionStatus.PENDING },
          { status: { $exists: false }, confirmedAt: { $exists: false } },
        ],
        confirmedAt: { $exists: false },
      }),
      { $set: { status: McpActionStatus.EXECUTING, executingAt: expect.any(Date) } },
      { new: true },
    );
    expect(updateOne).toHaveBeenCalledWith(
      { _id: action._id, status: McpActionStatus.EXECUTING },
      { $set: { status: McpActionStatus.COMPLETED, completedAt: expect.any(Date) } },
    );
    expect(ticketsService.update).toHaveBeenCalledTimes(1);
  });

  it('marks a claimed action as FAILED when the ticket mutation errors', async () => {
    const action = buildAction();
    const findOneAndUpdate = jest.fn().mockReturnValue(query(action));
    const updateOne = jest.fn().mockReturnValue(query({ modifiedCount: 1 }));
    const actionModel = {
      findOneAndUpdate,
      updateOne,
    } as unknown as Model<McpPendingActionDocument>;
    const ticketsService = {
      update: jest.fn().mockRejectedValue(new Error('Ticket changed. Reload it before updating.')),
    } as unknown as TicketsService;
    const auditService = {
      record: jest.fn().mockResolvedValue(undefined),
      recordCritical: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditService;
    const service = new McpActionService(actionModel, ticketsService, auditService);

    await expect(service.confirm(actor, 'opaque-action-token')).rejects.toThrow(
      'Ticket changed. Reload it before updating.',
    );

    expect(updateOne).toHaveBeenCalledWith(
      { _id: action._id, status: McpActionStatus.EXECUTING },
      {
        $set: {
          status: McpActionStatus.FAILED,
          failedAt: expect.any(Date),
          failureCode: 'Error',
          failureMessage: 'MCP action execution failed.',
        },
      },
    );
    expect(updateOne).not.toHaveBeenCalledWith(
      { _id: action._id, status: McpActionStatus.EXECUTING },
      { $set: { status: McpActionStatus.COMPLETED, completedAt: expect.any(Date) } },
    );
    expect(auditService.recordCritical).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MCP_ACTION_FAILED' }),
    );
  });

  it('atomically cancels only a pending action', async () => {
    const action = buildAction('TICKET_COMMENT');
    const findOneAndUpdate = jest.fn().mockReturnValue(query(action));
    const actionModel = { findOneAndUpdate } as unknown as Model<McpPendingActionDocument>;
    const service = new McpActionService(
      actionModel,
      {} as TicketsService,
      {
        record: jest.fn().mockResolvedValue(undefined),
        recordCritical: jest.fn().mockResolvedValue(undefined),
      } as unknown as AuditService,
    );

    await expect(service.cancel(actor, 'opaque-action-token')).resolves.toEqual({
      cancelled: true,
      status: McpActionStatus.CANCELLED,
    });
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        $or: [
          { status: McpActionStatus.PENDING },
          { status: { $exists: false }, confirmedAt: { $exists: false } },
        ],
        confirmedAt: { $exists: false },
      }),
      { $set: { status: McpActionStatus.CANCELLED, cancelledAt: expect.any(Date) } },
      { new: true },
    );
  });
});
