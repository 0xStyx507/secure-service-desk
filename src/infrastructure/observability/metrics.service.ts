import { Injectable } from '@nestjs/common';

interface Counter {
  value: number;
  labels: Record<string, string>;
}

@Injectable()
export class MetricsService {
  private readonly counters = new Map<string, Counter>();

  increment(name: string, labels: Record<string, string> = {}, value = 1): void {
    const key = `${name}|${JSON.stringify(labels)}`;
    const current = this.counters.get(key);
    if (current) {
      current.value += value;
      return;
    }
    this.counters.set(key, { value, labels });
  }

  renderPrometheus(): string {
    const lines = [
      '# HELP secure_service_desk_info Application information.',
      '# TYPE secure_service_desk_info gauge',
      'secure_service_desk_info{service="secure-service-desk-api"} 1',
    ];
    for (const [key, counter] of this.counters) {
      const name = key.slice(0, key.indexOf('|'));
      const labels = Object.entries(counter.labels)
        .map(([label, value]) => `${label}="${this.escape(value)}"`)
        .join(',');
      lines.push(`${name}${labels ? `{${labels}}` : ''} ${counter.value}`);
    }
    return `${lines.join('\n')}\n`;
  }

  private escape(value: string): string {
    return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n');
  }
}
