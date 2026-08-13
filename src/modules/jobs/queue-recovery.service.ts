import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { Model } from 'mongoose';
import { OutboxEvent, OutboxEventDocument } from './schemas/outbox-event.schema';
import { OutboxStatus } from './outbox-status.enum';
import { OutboxService } from './outbox.service';
import { NotificationDeliveryStatus } from '../notifications/notification-delivery-status.enum';
import { NOTIFICATIONS_QUEUE } from '../notifications/notifications.constants';
import { Notification, NotificationDocument } from '../notifications/schemas/notification.schema';
import { ReportStatus } from '../reports/report-status.enum';
import { REPORTS_QUEUE } from '../reports/reports.constants';
import { Report, ReportDocument } from '../reports/schemas/report.schema';

@Injectable()
export class QueueRecoveryService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private inFlight?: Promise<void>;
  private stopping = false;
  private readonly logger = new Logger(QueueRecoveryService.name);

  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    @InjectModel(Report.name)
    private readonly reportModel: Model<ReportDocument>,
    @InjectModel(OutboxEvent.name)
    private readonly outboxModel: Model<OutboxEventDocument>,
    @InjectQueue(NOTIFICATIONS_QUEUE)
    private readonly notificationsQueue: Queue,
    @InjectQueue(REPORTS_QUEUE)
    private readonly reportsQueue: Queue,
    private readonly configService: ConfigService,
    private readonly outboxService: OutboxService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.stopping = false;
    await this.runRecovery();
    this.scheduleNextRecovery();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    await this.inFlight;
  }

  private scheduleNextRecovery(): void {
    if (this.stopping) {
      return;
    }
    const interval = this.configService.get<number>('queueRecoveryIntervalMs') ?? 60_000;
    this.timer = setTimeout(() => {
      void this.runRecovery().finally(() => this.scheduleNextRecovery());
    }, interval);
    this.timer.unref();
  }

  private runRecovery(): Promise<void> {
    if (this.inFlight) {
      return this.inFlight;
    }
    this.inFlight = this.recover()
      .catch((error: unknown) => {
        this.logger.error(
          'Queue recovery failed.',
          error instanceof Error ? error.stack : undefined,
        );
      })
      .finally(() => {
        this.inFlight = undefined;
      });
    return this.inFlight;
  }

  async recover(): Promise<void> {
    const [notifications, outboxEvents, reports] = await Promise.all([
      this.notificationModel
        .find({ deliveryStatus: NotificationDeliveryStatus.PENDING })
        .sort({ createdAt: 1 })
        .limit(100)
        .select('_id')
        .lean()
        .exec(),
      this.outboxModel.find({
        topic: 'notifications.deliver',
        status: OutboxStatus.PENDING,
        availableAt: { $lte: new Date() },
      }).sort({ createdAt: 1 }).limit(100).exec(),
      this.reportModel
        .find({ status: ReportStatus.QUEUED })
        .sort({ createdAt: 1 })
        .limit(50)
        .select('_id requestedBy')
        .lean()
        .exec(),
    ]);

    const enqueueResults = await Promise.allSettled([
      ...notifications.map((notification) =>
        this.notificationsQueue.add(
          'deliver-internal',
          { notificationId: notification._id.toString() },
          {
            jobId: `notification-${notification._id.toString()}`,
            attempts: 3,
            backoff: { type: 'exponential', delay: 1_000, jitter: 0.25 },
            removeOnComplete: 1_000,
            removeOnFail: false,
          },
        ),
      ),
      ...outboxEvents.map(async (event) => {
        const notificationId = String(event.payload.notificationId ?? event.aggregateId);
        await this.notificationsQueue.add(
          'deliver-internal',
          { notificationId },
          {
            jobId: `notification-${notificationId}`,
            attempts: 3,
            backoff: { type: 'exponential', delay: 1_000, jitter: 0.25 },
            removeOnComplete: 1_000,
            removeOnFail: false,
          },
        );
        await this.outboxService.markDispatched(event.id);
      }),
      ...reports.map((report) =>
        this.reportsQueue.add(
          'generate-ticket-pdf',
          {
            reportId: report._id.toString(),
            actorId: report.requestedBy.toString(),
          },
          {
            jobId: `report-${report._id.toString()}`,
            attempts: 3,
            backoff: { type: 'exponential', delay: 2_000, jitter: 0.25 },
            removeOnComplete: 500,
            removeOnFail: false,
          },
        ),
      ),
    ]);
    const failures = enqueueResults
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => result.reason as unknown);
    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        `Queue recovery failed to enqueue ${failures.length} pending job(s).`,
      );
    }
  }
}
