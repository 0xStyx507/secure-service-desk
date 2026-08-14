import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { MetricsController } from './metrics.controller';
import { MetricsAccessGuard } from './metrics-access.guard';

@Module({
  controllers: [HealthController, MetricsController],
  providers: [MetricsAccessGuard],
})
export class HealthModule {}
