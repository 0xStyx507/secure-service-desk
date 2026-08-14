import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Job } from 'bullmq';
import { Model } from 'mongoose';
import {
  sanitizeSensitiveRecord,
  sanitizeSensitiveData,
} from '../../common/security/sanitize-sensitive-data';
import { JobFailureStatus } from './job-failure-status.enum';
import { JobFailure, JobFailureDocument } from './schemas/job-failure.schema';

@Injectable()
export class DeadLetterService {
  constructor(
    @InjectModel(JobFailure.name)
    private readonly failureModel: Model<JobFailureDocument>,
  ) {}

  async capture(queue: string, job: Job, error: Error): Promise<void> {
    const attempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < attempts) {
      return;
    }

    await this.failureModel.updateOne(
      { queue, jobId: String(job.id) },
      {
        $setOnInsert: {
          queue,
          jobId: String(job.id),
          jobName: job.name,
          payload: sanitizeSensitiveRecord(job.data, {
            maxDepth: 5,
            maxProperties: 20,
            maxStringLength: 500,
          }),
          error: sanitizeSensitiveData(error.message, { maxStringLength: 2_000 }) as string,
          attemptsMade: job.attemptsMade,
          status: JobFailureStatus.DEAD_LETTER,
          failedAt: new Date(),
        },
      },
      { upsert: true },
    );
  }
}
