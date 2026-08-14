import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { McpActionStatus } from '../../mcp/mcp-action-status.enum';

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

  @Prop({
    required: true,
    enum: Object.values(McpActionStatus),
    default: McpActionStatus.PENDING,
    index: true,
  })
  status!: McpActionStatus;

  @Prop({ type: Date })
  executingAt?: Date;

  @Prop({ type: Date })
  completedAt?: Date;

  @Prop({ type: Date })
  failedAt?: Date;

  @Prop({ maxlength: 64 })
  failureCode?: string;

  @Prop({ maxlength: 256 })
  failureMessage?: string;

  // Legacy markers are retained for compatibility with documents created before ADR-022.
  @Prop({ type: Date })
  confirmedAt?: Date;

  @Prop({ type: Date })
  cancelledAt?: Date;
}

export const McpPendingActionSchema = SchemaFactory.createForClass(McpPendingAction);
McpPendingActionSchema.index({ userId: 1, expiresAt: 1 });
