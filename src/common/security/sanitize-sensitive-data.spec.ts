import { sanitizeSensitiveData, sanitizeSensitiveRecord } from './sanitize-sensitive-data';

describe('sanitizeSensitiveData', () => {
  it('redacts sensitive keys recursively, including nested arrays', () => {
    const result = sanitizeSensitiveData({
      user: {
        password: 'top-secret',
        profile: [{ accessToken: 'token-value' }, { name: 'Ada' }],
      },
      authorization: 'Bearer should-not-be-kept',
    }) as Record<string, unknown>;

    expect(result).toEqual({
      user: { profile: [{}, { name: 'Ada' }] },
    });
  });

  it('enforces depth, property, and string limits', () => {
    const result = sanitizeSensitiveData(
      { one: { two: { three: { four: 'too deep' } } }, a: 1, b: 2 },
      { maxDepth: 2, maxProperties: 2, maxStringLength: 4 },
    ) as Record<string, unknown>;

    expect(Object.keys(result)).toHaveLength(2);
    expect(result.one).toEqual({ two: '[MaxDepth]' });
    expect(result.a).toBe(1);
    expect(sanitizeSensitiveData('123456', { maxStringLength: 4 })).toBe('1234');
  });

  it('does not recurse forever on cyclic values', () => {
    const cyclic: Record<string, unknown> = { name: 'cycle' };
    cyclic.self = cyclic;

    expect(sanitizeSensitiveData(cyclic)).toEqual({ name: 'cycle', self: '[Circular]' });
  });

  it('redacts credentials embedded in free-form strings', () => {
    expect(sanitizeSensitiveData('Bearer abc.def password=hunter2')).toBe(
      'Bearer [REDACTED] password=[REDACTED]',
    );
  });

  it('returns a record for dead-letter and audit payloads', () => {
    expect(sanitizeSensitiveRecord(['not', 'a', 'record'])).toEqual({});
  });
});
