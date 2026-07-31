import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectModel } from '@nestjs/mongoose';
import type { Job } from 'bullmq';
import { Model } from 'mongoose';
import { DeadLetterService } from '../jobs/dead-letter.service';
import { NotificationDeliveryStatus } from './notification-delivery-status.enum';
import { NOTIFICATIONS_QUEUE } from './notifications.constants';
import { Notification, NotificationDocument } from './schemas/notification.schema';

interface NotificationJob {
  notificationId: string;
}

@Processor(NOTIFICATIONS_QUEUE, { concurrency: 5 })
export class NotificationWorker extends WorkerHost {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    private readonly deadLetterService: DeadLetterService,
  ) {
    super();
  }

  async process(job: Job<NotificationJob>): Promise<void> {
    const result = await this.notificationModel.updateOne(
      { _id: job.data.notificationId },
      {
        $set: {
          deliveryStatus: NotificationDeliveryStatus.DELIVERED,
          deliveredAt: new Date(),
        },
      },
    );
    if (result.matchedCount !== 1) {
      throw new Error('Notification no longer exists.');
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<NotificationJob> | undefined, error: Error): Promise<void> {
    if (!job) {
      return;
    }
    await this.deadLetterService.capture(NOTIFICATIONS_QUEUE, job, error);
    const attempts = job.opts.attempts ?? 1;
    if (job.attemptsMade >= attempts) {
      await this.notificationModel.updateOne(
        { _id: job.data.notificationId },
        { $set: { deliveryStatus: NotificationDeliveryStatus.FAILED } },
      );
    }
  }
}
