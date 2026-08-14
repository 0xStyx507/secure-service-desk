import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { MetricsService } from '../../infrastructure/observability/metrics.service';
import { MetricsAccessGuard } from './metrics-access.guard';

@ApiTags('system')
@Controller('metrics')
@UseGuards(MetricsAccessGuard)
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @ApiOperation({ summary: 'Expose low-cardinality Prometheus metrics' })
  getMetrics(): string {
    return this.metricsService.renderPrometheus();
  }
}
