import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { JobFailureStatus } from '../job-failure-status.enum';

export type JobFailureDocument = HydratedDocument<JobFailure>;

@Schema({ timestamps: true, versionKey: false, collection: 'job_failures' })
export class JobFailure {
  @Prop({ required: true, trim: true, maxlength: 80, index: true })
  queue!: string;

  @Prop({ required: true, trim: true, maxlength: 200, index: true })
  jobId!: string;

  @Prop({ required: true, trim: true, maxlength: 100 })
  jobName!: string;

  @Prop({ type: Object, required: true })
  payload!: Record<string, unknown>;

  @Prop({ required: true, trim: true, maxlength: 2_000 })
  error!: string;

  @Prop({ required: true, min: 1 })
  attemptsMade!: number;

  @Prop({
    enum: Object.values(JobFailureStatus),
    default: JobFailureStatus.DEAD_LETTER,
    index: true,
  })
  status!: JobFailureStatus;

  @Prop({ type: Date, required: true, default: Date.now, index: true })
  failedAt!: Date;
}

export const JobFailureSchema = SchemaFactory.createForClass(JobFailure);
JobFailureSchema.index({ queue: 1, jobId: 1 }, { unique: true });
