import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { NotificationWorker } from './notification.worker';
import { NotificationsModule } from './notifications.module';

@Module({
  imports: [JobsModule, NotificationsModule],
  providers: [NotificationWorker],
})
export class NotificationsWorkerModule {}
