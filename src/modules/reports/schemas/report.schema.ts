import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ReportStatus } from '../report-status.enum';

export type ReportDocument = HydratedDocument<Report>;

@Schema({ timestamps: true, versionKey: false, collection: 'reports' })
export class Report {
  @Prop({ type: Types.ObjectId, required: true, index: true, ref: 'User' })
  requestedBy!: Types.ObjectId;

  @Prop({ required: true, default: 'TICKETS' })
  type!: string;

  @Prop({ type: Object, default: {} })
  filters!: Record<string, unknown>;

  @Prop({
    enum: Object.values(ReportStatus),
    default: ReportStatus.QUEUED,
    index: true,
  })
  status!: ReportStatus;

  @Prop({ type: Types.ObjectId })
  fileId?: Types.ObjectId;

  @Prop({ trim: true, maxlength: 2_000 })
  error?: string;

  @Prop({ type: Date })
  completedAt?: Date;

  @Prop({ type: Date, index: true })
  expiresAt?: Date;

  @Prop({ type: Date })
  purgedAt?: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ReportSchema = SchemaFactory.createForClass(Report);
