import { StructuredLogger } from './structured.logger';

describe('StructuredLogger', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('serializes Error details instead of emitting an empty object', () => {
    const write = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    new StructuredLogger().error(new Error('bootstrap failed'), undefined, 'Bootstrap');

    const firstCall = write.mock.calls[0];
    expect(firstCall).toBeDefined();
    const entry = JSON.parse(String(firstCall?.[0])) as Record<string, unknown>;
    expect(entry).toMatchObject({ level: 'error', context: 'Bootstrap' });
    expect(entry.message).toEqual(expect.stringContaining('bootstrap failed'));
    expect(entry.message).toEqual(expect.stringContaining('Error'));
  });

  it('sanitizes nested log metadata and trace credentials', () => {
    const write = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    new StructuredLogger().error(
      { request: { headers: { authorization: 'Bearer secret' }, input: [{ token: 'value' }] } },
      'password=secret-value',
      'Security',
    );

    const entry = JSON.parse(String(write.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(entry.message).toBe('{"request":{"headers":{},"input":[{}]}}');
    expect(entry.trace).toBe('password=[REDACTED]');
  });
});
