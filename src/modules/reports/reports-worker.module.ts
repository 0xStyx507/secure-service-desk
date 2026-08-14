import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { JobsModule } from '../jobs/jobs.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TicketsModule } from '../tickets/tickets.module';
import { ReportWorker } from './report.worker';
import { ReportsModule } from './reports.module';
import { ReportRetentionService } from './report-retention.service';

@Module({
  imports: [AuditModule, JobsModule, NotificationsModule, ReportsModule, TicketsModule],
  providers: [ReportWorker, ReportRetentionService],
})
export class ReportsWorkerModule {}
