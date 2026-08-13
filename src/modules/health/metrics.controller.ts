import { Controller, Get, Header } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { MetricsService } from '../../infrastructure/observability/metrics.service';

@ApiTags('system')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @ApiOperation({ summary: 'Expose low-cardinality Prometheus metrics' })
  getMetrics(): string {
    return this.metricsService.renderPrometheus();
  }
}
