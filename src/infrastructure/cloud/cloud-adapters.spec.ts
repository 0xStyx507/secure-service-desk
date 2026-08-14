import { CloudWatchClient } from '@aws-sdk/client-cloudwatch';
import { S3Client } from '@aws-sdk/client-s3';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { SQSClient } from '@aws-sdk/client-sqs';
import { AwsSecretsProvider } from './aws-secrets-provider';
import { CloudWatchObservability } from './cloudwatch-observability';
import { S3AttachmentStorage } from './s3-attachment-storage';
import { SqsEventPublisher } from './sqs-event-publisher';

describe('AWS-compatible adapters', () => {
  it('uploads and deletes bounded S3 object keys', async () => {
    const client = new S3Client({ region: 'us-east-1' });
    const send = jest.spyOn(client, 'send').mockResolvedValue({} as never);
    const adapter = new S3AttachmentStorage(client, 'attachments');

    await adapter.putObject({
      key: 'tickets/ticket-1/photo.jpg',
      body: Buffer.from('image'),
      contentType: 'image/jpeg',
      metadata: { checksum: 'abc' },
    });
    await adapter.deleteObject('tickets/ticket-1/photo.jpg');

    expect(send).toHaveBeenCalledTimes(2);
    await expect(adapter.deleteObject('../secret')).rejects.toThrow('Invalid cloud object key');
  });

  it('publishes JSON events and rejects oversized payloads', async () => {
    const client = new SQSClient({ region: 'us-east-1' });
    const send = jest.spyOn(client, 'send').mockResolvedValue({ MessageId: 'message-1' } as never);
    const adapter = new SqsEventPublisher(client);

    await expect(
      adapter.publish({
        queueUrl: 'http://localhost:4566/000000000000/events',
        message: { event: 'ticket.created' },
        deduplicationId: 'event-1',
      }),
    ).resolves.toEqual({ messageId: 'message-1' });
    expect(send).toHaveBeenCalledTimes(1);
    await expect(
      adapter.publish({ queueUrl: 'queue', message: 'x'.repeat(256 * 1024 + 1) }),
    ).rejects.toThrow('Cloud event payload exceeds the SQS limit');
  });

  it('reads string and binary secrets without logging their values', async () => {
    const client = new SecretsManagerClient({ region: 'us-east-1' });
    const send = jest.spyOn(client, 'send');
    send.mockResolvedValueOnce({ SecretString: '{"key":"value"}' } as never);
    send.mockResolvedValueOnce({ SecretBinary: Buffer.from('binary-secret') } as never);
    const adapter = new AwsSecretsProvider(client);

    await expect(adapter.getSecret('service/config')).resolves.toBe('{"key":"value"}');
    await expect(adapter.getSecret('service/binary')).resolves.toBe('binary-secret');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('publishes bounded CloudWatch metrics with normalized dimensions', async () => {
    const client = new CloudWatchClient({ region: 'us-east-1' });
    const send = jest.spyOn(client, 'send').mockResolvedValue({} as never);
    const adapter = new CloudWatchObservability(client, 'SecureServiceDesk');

    await adapter.recordMetric({
      name: 'TicketCreated',
      value: 1,
      unit: 'Count',
      dimensions: { environment: 'test' },
    });

    expect(send).toHaveBeenCalledTimes(1);
    await expect(adapter.recordMetric({ name: 'invalid name', value: 1 })).rejects.toThrow(
      'Invalid CloudWatch metric',
    );
  });
});
