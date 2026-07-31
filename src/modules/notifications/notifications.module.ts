import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NOTIFICATIONS_QUEUE } from './notifications.constants';
import { Notification, NotificationSchema } from './schemas/notification.schema';

@Module({
  imports: [
    AuthModule,
    BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE }),
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
    ]),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService, MongooseModule, BullModule],
})
export class NotificationsModule {}
