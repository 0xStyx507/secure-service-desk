import {
  AttachmentStoragePort,
  EventPublisherPort,
  ObservabilityPort,
  SecretsProviderPort,
} from './cloud.ports';

export interface PublishedCloudEvent {
  queueUrl: string;
  message: unknown;
  deduplicationId?: string;
}

export interface RecordedCloudMetric {
  name: string;
  value: number;
  unit?: 'Count' | 'Milliseconds' | 'Bytes' | 'None';
  dimensions?: Record<string, string>;
}

export class InMemoryAttachmentStorage implements AttachmentStoragePort {
  private readonly objects = new Map<string, Uint8Array>();

  async putObject(input: {
    key: string;
    body: Uint8Array;
    contentType: string;
    metadata?: Record<string, string>;
  }): Promise<void> {
    void input.contentType;
    void input.metadata;
    this.objects.set(input.key, new Uint8Array(input.body));
  }

  async deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
  }

  hasObject(key: string): boolean {
    return this.objects.has(key);
  }

  getObject(key: string): Uint8Array | undefined {
    const body = this.objects.get(key);
    return body ? new Uint8Array(body) : undefined;
  }
}

export class InMemoryEventPublisher implements EventPublisherPort {
  readonly published: PublishedCloudEvent[] = [];

  async publish(input: PublishedCloudEvent): Promise<{ messageId: string }> {
    this.published.push({ ...input });
    return { messageId: `mock-message-${this.published.length}` };
  }
}

export class InMemorySecretsProvider implements SecretsProviderPort {
  constructor(private readonly secrets: ReadonlyMap<string, string> = new Map()) {}

  async getSecret(secretId: string): Promise<string> {
    const value = this.secrets.get(secretId);
    if (value === undefined) {
      throw new Error('Mock secret not found');
    }
    return value;
  }
}

export class InMemoryObservability implements ObservabilityPort {
  readonly metrics: RecordedCloudMetric[] = [];

  async recordMetric(input: RecordedCloudMetric): Promise<void> {
    this.metrics.push({
      ...input,
      dimensions: input.dimensions ? { ...input.dimensions } : undefined,
    });
  }
}
