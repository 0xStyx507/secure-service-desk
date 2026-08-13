import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  it('renders escaped low-cardinality counters', () => {
    const service = new MetricsService();
    service.increment('secure_service_desk_http_requests_total', {
      method: 'GET',
      route: '/api/health/live',
      status: '200',
    }, 2);

    expect(service.renderPrometheus()).toContain(
      'secure_service_desk_http_requests_total{method="GET",route="/api/health/live",status="200"} 2',
    );
  });
});
