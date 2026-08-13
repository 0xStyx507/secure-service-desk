import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { OutboxStatus } from '../outbox-status.enum';

export type OutboxEventDocument = HydratedDocument<OutboxEvent>;

@Schema({ timestamps: true, versionKey: false, collection: 'outbox_events' })
export class OutboxEvent {
  @Prop({ required: true, unique: true, trim: true, maxlength: 120 })
  eventId!: string;

  @Prop({ required: true, trim: true, maxlength: 80, index: true })
  topic!: string;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  aggregateId!: Types.ObjectId;

  @Prop({ type: Object, required: true })
  payload!: Record<string, unknown>;

  @Prop({ enum: Object.values(OutboxStatus), default: OutboxStatus.PENDING, index: true })
  status!: OutboxStatus;

  @Prop({ type: Date, default: Date.now, index: true })
  availableAt!: Date;

  @Prop({ type: Date })
  dispatchedAt?: Date;

  @Prop({ trim: true, maxlength: 2_000 })
  lastError?: string;
}

export const OutboxEventSchema = SchemaFactory.createForClass(OutboxEvent);
OutboxEventSchema.index({ status: 1, availableAt: 1, createdAt: 1 });
