import type { Job } from 'bullmq';
import type { Model } from 'mongoose';
import { DeadLetterService } from './dead-letter.service';
import type { JobFailureDocument } from './schemas/job-failure.schema';

describe('DeadLetterService', () => {
  it('records only an exhausted job and removes sensitive payload fields', async () => {
    const updateOne = jest.fn().mockResolvedValue({});
    const model = { updateOne } as unknown as Model<JobFailureDocument>;
    const service = new DeadLetterService(model);
    const job = {
      id: 'job-1',
      name: 'generate',
      data: {
        reportId: 'report-1',
        accessToken: 'must-not-be-stored',
      },
      attemptsMade: 3,
      opts: { attempts: 3 },
    } as Job;

    await service.capture('reports', job, new Error('permanent failure'));

    expect(updateOne).toHaveBeenCalledWith(
      { queue: 'reports', jobId: 'job-1' },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({
          payload: { reportId: 'report-1' },
          attemptsMade: 3,
        }),
      }),
      { upsert: true },
    );
  });

  it('does not dead-letter a job that still has retries', async () => {
    const updateOne = jest.fn();
    const service = new DeadLetterService({ updateOne } as never);
    const job = {
      id: 'job-2',
      attemptsMade: 1,
      opts: { attempts: 3 },
    } as Job;

    await service.capture('reports', job, new Error('temporary'));

    expect(updateOne).not.toHaveBeenCalled();
  });
});
