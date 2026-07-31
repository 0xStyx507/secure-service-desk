import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { REPORTS_QUEUE } from './reports.constants';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { Report, ReportSchema } from './schemas/report.schema';

@Module({
  imports: [
    AuditModule,
    AuthModule,
    NotificationsModule,
    BullModule.registerQueue({ name: REPORTS_QUEUE }),
    MongooseModule.forFeature([
      { name: Report.name, schema: ReportSchema },
    ]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService, MongooseModule, BullModule],
})
export class ReportsModule {}
