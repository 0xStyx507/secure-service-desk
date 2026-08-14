import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { EventPublisherPort } from './cloud.ports';

const MAX_SQS_MESSAGE_BYTES = 256 * 1024;

export class SqsEventPublisher implements EventPublisherPort {
  constructor(private readonly client: SQSClient) {}

  async publish(input: {
    queueUrl: string;
    message: unknown;
    deduplicationId?: string;
  }): Promise<{ messageId?: string }> {
    const queueUrl = input.queueUrl.trim();
    const body = JSON.stringify(input.message);
    if (!queueUrl || queueUrl.length > 512) {
      throw new Error('Invalid cloud queue URL');
    }
    if (Buffer.byteLength(body, 'utf8') > MAX_SQS_MESSAGE_BYTES) {
      throw new Error('Cloud event payload exceeds the SQS limit');
    }
    const response = await this.client.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: body,
        ...(input.deduplicationId ? { MessageDeduplicationId: input.deduplicationId } : {}),
      }),
    );
    return { messageId: response.MessageId };
  }
}
