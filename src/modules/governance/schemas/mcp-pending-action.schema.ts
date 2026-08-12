import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type McpPendingActionDocument = HydratedDocument<McpPendingAction>;

@Schema({ timestamps: true, versionKey: false, collection: 'mcp_pending_actions' })
export class McpPendingAction {
  @Prop({ type: Types.ObjectId, required: true, index: true, ref: 'User' })
  userId!: Types.ObjectId;

  @Prop({ required: true, select: false, unique: true })
  tokenHash!: string;

  @Prop({ required: true, enum: ['TICKET_COMMENT', 'STATUS_CHANGE'] })
  actionType!: 'TICKET_COMMENT' | 'STATUS_CHANGE';

  @Prop({ type: Object, required: true })
  payload!: Record<string, unknown>;

  @Prop({ required: true, expires: 0 })
  expiresAt!: Date;

  @Prop({ type: Date })
  confirmedAt?: Date;

  @Prop({ type: Date })
  cancelledAt?: Date;
}

export const McpPendingActionSchema = SchemaFactory.createForClass(McpPendingAction);
McpPendingActionSchema.index({ userId: 1, expiresAt: 1 });
