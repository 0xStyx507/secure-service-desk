import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './config/environment.validation';
import { DatabaseModule } from './database/database.module';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { QueueRecoveryModule } from './modules/jobs/queue-recovery.module';
import { NotificationsWorkerModule } from './modules/notifications/notifications-worker.module';
import { ReportsWorkerModule } from './modules/reports/reports-worker.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      validate: validateEnvironment,
    }),
    DatabaseModule,
    InfrastructureModule,
    JobsModule,
    QueueRecoveryModule,
    NotificationsWorkerModule,
    ReportsWorkerModule,
  ],
})
export class WorkerAppModule {}
