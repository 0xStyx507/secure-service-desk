import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { OutboxEvent, OutboxEventDocument } from './schemas/outbox-event.schema';

export interface OutboxInput {
  topic: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  eventId?: string;
}

@Injectable()
export class OutboxService {
  constructor(
    @InjectModel(OutboxEvent.name)
    private readonly outboxModel: Model<OutboxEventDocument>,
  ) {}

  record(input: OutboxInput): Promise<OutboxEventDocument> {
    return this.outboxModel.create({
      eventId: input.eventId ?? randomUUID(),
      topic: input.topic,
      aggregateId: new Types.ObjectId(input.aggregateId),
      payload: input.payload,
    });
  }

  async markDispatched(id: string): Promise<void> {
    await this.outboxModel.updateOne(
      { _id: id, status: 'PENDING' },
      { $set: { status: 'DISPATCHED', dispatchedAt: new Date() }, $unset: { lastError: 1 } },
    ).exec();
  }
}
