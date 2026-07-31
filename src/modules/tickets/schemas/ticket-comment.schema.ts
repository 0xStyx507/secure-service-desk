import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { CommentVisibility } from '../comment-visibility.enum';

export type TicketCommentDocument = HydratedDocument<TicketComment>;

@Schema({ timestamps: true, versionKey: false, collection: 'ticket_comments' })
export class TicketComment {
  @Prop({ type: Types.ObjectId, required: true, index: true, ref: 'Ticket' })
  ticketId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true, ref: 'User' })
  authorId!: Types.ObjectId;

  @Prop({ required: true, trim: true, minlength: 1, maxlength: 10_000 })
  body!: string;

  @Prop({
    enum: Object.values(CommentVisibility),
    default: CommentVisibility.PUBLIC,
    index: true,
  })
  visibility!: CommentVisibility;

  createdAt!: Date;
  updatedAt!: Date;
}

export const TicketCommentSchema = SchemaFactory.createForClass(TicketComment);
TicketCommentSchema.index({ ticketId: 1, createdAt: 1 });
