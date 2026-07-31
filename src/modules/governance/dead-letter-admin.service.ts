import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { Model } from 'mongoose';
import { AuditService } from '../audit/audit.service';
import { JobFailureStatus } from '../jobs/job-failure-status.enum';
import {
  JobFailure,
  JobFailureDocument,
} from '../jobs/schemas/job-failure.schema';
import { NotificationDeliveryStatus } from '../notifications/notification-delivery-status.enum';
import { NOTIFICATIONS_QUEUE } from '../notifications/notifications.constants';
import {
  Notification,
  NotificationDocument,
} from '../notifications/schemas/notification.schema';
import { ReportStatus } from '../reports/report-status.enum';
import { REPORTS_QUEUE } from '../reports/reports.constants';
import { Report, ReportDocument } from '../reports/schemas/report.schema';
import { ListJobFailuresDto } from './dto/list-job-failures.dto';

@Injectable()
export class DeadLetterAdminService {
  constructor(
    @InjectModel(JobFailure.name)
    private readonly failureModel: Model<JobFailureDocument>,
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    @InjectModel(Report.name)
    private readonly reportModel: Model<ReportDocument>,
    @InjectQueue(NOTIFICATIONS_QUEUE)
    private readonly notificationsQueue: Queue,
    @InjectQueue(REPORTS_QUEUE)
    private readonly reportsQueue: Queue,
    private readonly auditService: AuditService,
  ) {}

  async list(query: ListJobFailuresDto) {
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      this.failureModel
        .find()
        .sort({ failedAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .lean()
        .exec(),
      this.failureModel.countDocuments().exec(),
    ]);
    return {
      items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      },
    };
  }

  async reprocess(id: string, actorId: string): Promise<void> {
    const failure = await this.failureModel
      .findOneAndUpdate(
        { _id: id, status: JobFailureStatus.DEAD_LETTER },
        { $set: { status: JobFailureStatus.REPROCESSED } },
        { new: true },
      )
      .exec();
    if (!failure) {
      throw new NotFoundException('Dead-letter job not found or already reprocessed.');
    }

    try {
      if (failure.queue === REPORTS_QUEUE) {
        await this.reprocessReport(failure);
      } else if (failure.queue === NOTIFICATIONS_QUEUE) {
        await this.reprocessNotification(failure);
      } else {
        throw new BadRequestException('This queue cannot be reprocessed.');
      }
      await this.auditService.record({
        actorId,
        action: 'DEAD_LETTER_REPROCESSED',
        resourceType: 'job_failure',
        resourceId: failure.id,
        metadata: { queue: failure.queue, originalJobId: failure.jobId },
      });
    } catch (error) {
      await this.failureModel.updateOne(
        { _id: failure._id },
        { $set: { status: JobFailureStatus.DEAD_LETTER } },
      );
      throw error;
    }
  }

  private async reprocessReport(failure: JobFailureDocument): Promise<void> {
    const reportId = this.requiredString(failure.payload.reportId, 'reportId');
    const actorId = this.requiredString(failure.payload.actorId, 'actorId');
    await this.reportModel.updateOne(
      { _id: reportId },
      { $set: { status: ReportStatus.QUEUED }, $unset: { error: 1 } },
    );
    await this.reportsQueue.add(
      failure.jobName,
      { reportId, actorId },
      {
        jobId: `reprocess-${failure.id}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2_000, jitter: 0.25 },
        removeOnComplete: 500,
        removeOnFail: false,
      },
    );
  }

  private async reprocessNotification(failure: JobFailureDocument): Promise<void> {
    const notificationId = this.requiredString(
      failure.payload.notificationId,
      'notificationId',
    );
    await this.notificationModel.updateOne(
      { _id: notificationId },
      { $set: { deliveryStatus: NotificationDeliveryStatus.PENDING } },
    );
    await this.notificationsQueue.add(
      failure.jobName,
      { notificationId },
      {
        jobId: `reprocess-${failure.id}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000, jitter: 0.25 },
        removeOnComplete: 1_000,
        removeOnFail: false,
      },
    );
  }

  private requiredString(value: unknown, name: string): string {
    if (typeof value !== 'string' || !value) {
      throw new BadRequestException(`Dead-letter payload is missing ${name}.`);
    }
    return value;
  }
}
