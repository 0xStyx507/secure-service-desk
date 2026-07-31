import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { TicketPriority } from '../ticket-priority.enum';
import { TicketStatus } from '../ticket-status.enum';

export type TicketDocument = HydratedDocument<Ticket>;

@Schema({
  timestamps: true,
  versionKey: 'version',
  optimisticConcurrency: true,
  collection: 'tickets',
})
export class Ticket {
  @Prop({ required: true, unique: true, trim: true })
  number!: string;

  @Prop({ required: true, trim: true, minlength: 3, maxlength: 160 })
  subject!: string;

  @Prop({ required: true, trim: true, minlength: 10, maxlength: 10_000 })
  description!: string;

  @Prop({
    enum: Object.values(TicketStatus),
    default: TicketStatus.OPEN,
    index: true,
  })
  status!: TicketStatus;

  @Prop({
    enum: Object.values(TicketPriority),
    default: TicketPriority.MEDIUM,
    index: true,
  })
  priority!: TicketPriority;

  @Prop({ type: Types.ObjectId, required: true, index: true, ref: 'User' })
  requesterId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, index: true, ref: 'User' })
  assigneeId?: Types.ObjectId;

  @Prop({ type: [Types.ObjectId], default: [], ref: 'User' })
  watcherIds!: Types.ObjectId[];

  @Prop({ trim: true, minlength: 5, maxlength: 5_000 })
  resolution?: string;

  @Prop({ type: Date })
  resolvedAt?: Date;

  @Prop({ type: Date })
  closedAt?: Date;

  createdAt!: Date;
  updatedAt!: Date;
  version!: number;
}

export const TicketSchema = SchemaFactory.createForClass(Ticket);
TicketSchema.index({ subject: 'text', description: 'text' });
