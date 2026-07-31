import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { AttachmentStatus } from '../attachment-status.enum';

export type AttachmentDocument = HydratedDocument<Attachment>;

@Schema({ timestamps: true, versionKey: false, collection: 'attachment_metadata' })
export class Attachment {
  @Prop({ type: Types.ObjectId, required: true, unique: true })
  fileId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true, ref: 'Ticket' })
  ticketId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true, ref: 'User' })
  uploadedBy!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 180 })
  originalName!: string;

  @Prop({ required: true, enum: ['image/jpeg', 'image/png'] })
  mimeType!: string;

  @Prop({ required: true, min: 1 })
  size!: number;

  @Prop({ required: true, match: /^[a-f0-9]{64}$/ })
  checksumSha256!: string;

  @Prop({
    required: true,
    enum: Object.values(AttachmentStatus),
    default: AttachmentStatus.CONTENT_VALIDATED,
  })
  status!: AttachmentStatus;

  createdAt!: Date;
  updatedAt!: Date;
}

export const AttachmentSchema = SchemaFactory.createForClass(Attachment);
AttachmentSchema.index({ ticketId: 1, createdAt: 1 });
AttachmentSchema.index({ ticketId: 1, checksumSha256: 1 }, { unique: true });
