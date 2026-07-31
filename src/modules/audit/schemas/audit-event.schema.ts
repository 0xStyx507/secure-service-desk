import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AuditEventDocument = HydratedDocument<AuditEvent>;

@Schema({ versionKey: false, collection: 'audit_events' })
export class AuditEvent {
  @Prop({ type: Types.ObjectId, index: true, ref: 'User' })
  actorId?: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 100, index: true })
  action!: string;

  @Prop({ required: true, trim: true, maxlength: 80, index: true })
  resourceType!: string;

  @Prop({ required: true, trim: true, maxlength: 200, index: true })
  resourceId!: string;

  @Prop({ type: Object, default: {} })
  metadata!: Record<string, unknown>;

  @Prop({ trim: true, maxlength: 100, index: true })
  requestId?: string;

  @Prop({ type: Date, required: true, default: Date.now, index: true })
  occurredAt!: Date;
}

export const AuditEventSchema = SchemaFactory.createForClass(AuditEvent);
AuditEventSchema.index({ resourceType: 1, resourceId: 1, occurredAt: -1 });
