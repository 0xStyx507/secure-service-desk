import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { GovernanceController } from './governance.controller';
import { JobsModule } from '../jobs/jobs.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReportsModule } from '../reports/reports.module';
import { DeadLetterAdminService } from './dead-letter-admin.service';
import { NOTIFICATIONS_QUEUE } from '../notifications/notifications.constants';
import { REPORTS_QUEUE } from '../reports/reports.constants';

@Module({
  imports: [
    AuditModule,
    AuthModule,
    JobsModule,
    NotificationsModule,
    ReportsModule,
    UsersModule,
    BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE }, { name: REPORTS_QUEUE }),
  ],
  controllers: [GovernanceController],
  providers: [DeadLetterAdminService],
})
export class GovernanceModule {}
