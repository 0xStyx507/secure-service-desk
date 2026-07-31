import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Job } from 'bullmq';
import { Model } from 'mongoose';
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
          payload: this.safePayload(job.data),
          error: error.message.slice(0, 2_000),
          attemptsMade: job.attemptsMade,
          status: JobFailureStatus.DEAD_LETTER,
          failedAt: new Date(),
        },
      },
      { upsert: true },
    );
  }

  private safePayload(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    const entries = Object.entries(value).slice(0, 20);
    return Object.fromEntries(
      entries
        .filter(
          ([key]) =>
            !/password|token|cookie|authorization|secret|private.?key/i.test(key),
        )
        .map(([key, item]) => [
          key.slice(0, 80),
          typeof item === 'string' ? item.slice(0, 500) : item,
        ]),
    );
  }
}
