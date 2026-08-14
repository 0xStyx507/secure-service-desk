import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { sanitizeSensitiveRecord } from '../../common/security/sanitize-sensitive-data';
import { ListAuditEventsDto } from './dto/list-audit-events.dto';
import { RequestContextService } from '../../infrastructure/context/request-context.service';
import { AuditEvent, AuditEventDocument } from './schemas/audit-event.schema';

export interface RecordAuditEvent {
  actorId?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
}

const CRITICAL_ACTIONS = new Set([
  'USER_ROLES_UPDATED',
  'MFA_ENABLED',
  'MFA_DISABLED',
  'MCP_ACTION_EXECUTING',
  'MCP_ACTION_COMPLETED',
  'MCP_ACTION_FAILED',
  'MCP_ACTION_CANCELLED',
  'REFRESH_TOKEN_REUSE_DETECTED',
  'DEAD_LETTER_REPROCESSED',
]);

@Injectable()
export class AuditService {
  constructor(
    @InjectModel(AuditEvent.name)
    private readonly auditModel: Model<AuditEventDocument>,
    private readonly requestContext: RequestContextService,
  ) {}

  async record(event: RecordAuditEvent): Promise<void> {
    await this.persist(event);
  }

  async recordCritical(event: RecordAuditEvent): Promise<void> {
    if (!CRITICAL_ACTIONS.has(event.action)) {
      throw new Error(`Audit action is not classified as critical: ${event.action}`);
    }
    await this.persist(event);
  }

  private async persist(event: RecordAuditEvent): Promise<void> {
    await this.auditModel.create({
      actorId: event.actorId ? new Types.ObjectId(event.actorId) : undefined,
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      metadata: sanitizeSensitiveRecord(event.metadata ?? {}, {
        maxDepth: 5,
        maxProperties: 30,
        maxStringLength: 1_000,
      }),
      requestId: this.requestContext.requestId,
      occurredAt: new Date(),
    });
  }

  async list(query: ListAuditEventsDto) {
    const filter: Record<string, unknown> = {};
    if (query.action) filter.action = query.action;
    if (query.resourceType) filter.resourceType = query.resourceType;
    if (query.resourceId) filter.resourceId = query.resourceId;
    if (query.actorId) filter.actorId = new Types.ObjectId(query.actorId);
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      this.auditModel
        .find(filter)
        .sort({ occurredAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .lean()
        .exec(),
      this.auditModel.countDocuments(filter).exec(),
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
