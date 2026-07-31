import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
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

@Injectable()
export class AuditService {
  constructor(
    @InjectModel(AuditEvent.name)
    private readonly auditModel: Model<AuditEventDocument>,
    private readonly requestContext: RequestContextService,
  ) {}

  async record(event: RecordAuditEvent): Promise<void> {
    await this.auditModel.create({
      actorId: event.actorId ? new Types.ObjectId(event.actorId) : undefined,
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      metadata: this.sanitizeMetadata(event.metadata ?? {}),
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

  private sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
    const blocked = /password|token|cookie|authorization|secret|private.?key/i;
    return Object.fromEntries(
      Object.entries(metadata)
        .filter(([key]) => !blocked.test(key))
        .slice(0, 30)
        .map(([key, value]) => [
          key.slice(0, 100),
          typeof value === 'string' ? value.slice(0, 1_000) : value,
        ]),
    );
  }
}
