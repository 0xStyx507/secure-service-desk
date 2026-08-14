export const ATTACHMENT_STORAGE_PORT = Symbol('ATTACHMENT_STORAGE_PORT');
export const EVENT_PUBLISHER_PORT = Symbol('EVENT_PUBLISHER_PORT');
export const SECRETS_PROVIDER_PORT = Symbol('SECRETS_PROVIDER_PORT');
export const OBSERVABILITY_PORT = Symbol('OBSERVABILITY_PORT');

export interface AttachmentStoragePort {
  putObject(input: {
    key: string;
    body: Uint8Array;
    contentType: string;
    metadata?: Record<string, string>;
  }): Promise<void>;
  deleteObject(key: string): Promise<void>;
}

export interface EventPublisherPort {
  publish(input: {
    queueUrl: string;
    message: unknown;
    deduplicationId?: string;
  }): Promise<{ messageId?: string }>;
}

export interface SecretsProviderPort {
  getSecret(secretId: string): Promise<string>;
}

export interface ObservabilityPort {
  recordMetric(input: {
    name: string;
    value: number;
    unit?: 'Count' | 'Milliseconds' | 'Bytes' | 'None';
    dimensions?: Record<string, string>;
  }): Promise<void>;
}
