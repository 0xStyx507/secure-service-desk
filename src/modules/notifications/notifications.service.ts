import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { Model, Types } from 'mongoose';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { Notification, NotificationDocument } from './schemas/notification.schema';
import { NOTIFICATIONS_QUEUE } from './notifications.constants';
import { OutboxService } from '../jobs/outbox.service';

export interface CreateNotification {
  userId: string;
  type: string;
  title: string;
  message: string;
  resourceType: string;
  resourceId: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    @InjectQueue(NOTIFICATIONS_QUEUE)
    private readonly queue: Queue,
    private readonly outboxService: OutboxService,
  ) {}

  async create(input: CreateNotification): Promise<void> {
    const notification = await this.notificationModel.create({
      ...input,
      userId: new Types.ObjectId(input.userId),
    });
    const event = await this.outboxService.record({
      topic: 'notifications.deliver',
      aggregateId: notification.id,
      payload: { notificationId: notification.id },
      eventId: `notification-${notification.id}`,
    });
    await this.enqueue(notification.id, event.id);
  }

  async createMany(inputs: CreateNotification[]): Promise<void> {
    if (inputs.length === 0) {
      return;
    }
    const notifications = await this.notificationModel.insertMany(
      inputs.map((input) => ({
        ...input,
        userId: new Types.ObjectId(input.userId),
      })),
      { ordered: false },
    );
    await Promise.allSettled(
      notifications.map(async (notification) => {
        const event = await this.outboxService.record({
          topic: 'notifications.deliver',
          aggregateId: notification.id,
          payload: { notificationId: notification.id },
          eventId: `notification-${notification.id}`,
        });
        await this.enqueue(notification.id, event.id);
      }),
    );
  }

  async list(userId: string, query: ListNotificationsDto) {
    const filter: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
    if (query.unread === true) {
      filter.readAt = { $exists: false };
    }
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      this.notificationModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .exec(),
      this.notificationModel.countDocuments(filter).exec(),
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

  async markRead(id: string, userId: string): Promise<NotificationDocument> {
    const notification = await this.notificationModel
      .findOneAndUpdate(
        { _id: id, userId: new Types.ObjectId(userId) },
        { $set: { readAt: new Date() } },
        { new: true },
      )
      .exec();
    if (!notification) {
      throw new NotFoundException('Notification not found.');
    }
    return notification;
  }

  private async enqueue(notificationId: string, outboxId?: string): Promise<void> {
    try {
      await this.queue.add(
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
      if (outboxId) await this.outboxService.markDispatched(outboxId);
    } catch {
      // MongoDB keeps PENDING as a durable recovery marker if Redis is unavailable.
    }
  }
}
