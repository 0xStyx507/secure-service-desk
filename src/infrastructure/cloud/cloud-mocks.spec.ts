import {
  InMemoryAttachmentStorage,
  InMemoryEventPublisher,
  InMemoryObservability,
  InMemorySecretsProvider,
} from './cloud-mocks';

describe('cloud adaptation mocks', () => {
  it('stores and removes attachment bytes without external I/O', async () => {
    const storage = new InMemoryAttachmentStorage();
    const body = Buffer.from('attachment');

    await storage.putObject({
      key: 'tickets/ticket-1/file.png',
      body,
      contentType: 'image/png',
    });

    expect(storage.hasObject('tickets/ticket-1/file.png')).toBe(true);
    expect(Buffer.from(storage.getObject('tickets/ticket-1/file.png') ?? []).toString()).toBe(
      'attachment',
    );

    await storage.deleteObject('tickets/ticket-1/file.png');
    expect(storage.hasObject('tickets/ticket-1/file.png')).toBe(false);
  });

  it('records events, secrets and metrics for contract tests', async () => {
    const publisher = new InMemoryEventPublisher();
    const secrets = new InMemorySecretsProvider(new Map([['test/config', 'dummy-value']]));
    const observability = new InMemoryObservability();

    await expect(
      publisher.publish({ queueUrl: 'mock://events', message: { type: 'ticket.created' } }),
    ).resolves.toEqual({ messageId: 'mock-message-1' });
    await expect(secrets.getSecret('test/config')).resolves.toBe('dummy-value');
    await expect(secrets.getSecret('missing')).rejects.toThrow('Mock secret not found');
    await observability.recordMetric({ name: 'TicketCreated', value: 1, unit: 'Count' });

    expect(publisher.published).toHaveLength(1);
    expect(observability.metrics).toEqual([
      { name: 'TicketCreated', value: 1, unit: 'Count', dimensions: undefined },
    ]);
  });
});
