import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReportsModule } from '../reports/reports.module';
import { QueueRecoveryService } from './queue-recovery.service';

@Module({
  imports: [NotificationsModule, ReportsModule],
  providers: [QueueRecoveryService],
})
export class QueueRecoveryModule {}
