import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { ObservabilityPort } from './cloud.ports';

export class CloudWatchObservability implements ObservabilityPort {
  constructor(
    private readonly client: CloudWatchClient,
    private readonly namespace: string,
  ) {}

  async recordMetric(input: {
    name: string;
    value: number;
    unit?: 'Count' | 'Milliseconds' | 'Bytes' | 'None';
    dimensions?: Record<string, string>;
  }): Promise<void> {
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,254}$/.test(input.name) || !Number.isFinite(input.value)) {
      throw new Error('Invalid CloudWatch metric');
    }
    const dimensions = Object.entries(input.dimensions ?? {}).map(([Name, Value]) => {
      if (!/^[A-Za-z][A-Za-z0-9_.-]{0,254}$/.test(Name) || Value.length > 255) {
        throw new Error('Invalid CloudWatch metric dimensions');
      }
      return { Name, Value };
    });
    await this.client.send(
      new PutMetricDataCommand({
        Namespace: this.namespace,
        MetricData: [
          { MetricName: input.name, Value: input.value, Unit: input.unit, Dimensions: dimensions },
        ],
      }),
    );
  }
}
