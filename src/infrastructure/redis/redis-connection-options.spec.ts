import { redisConnectionOptions } from './redis-connection-options';

describe('redisConnectionOptions', () => {
  it('parses credentials, database and TLS without exposing the URL elsewhere', () => {
    expect(redisConnectionOptions('rediss://user:secret@cache.example:6380/2')).toMatchObject({
      host: 'cache.example',
      port: 6380,
      username: 'user',
      password: 'secret',
      db: 2,
      tls: {},
      maxRetriesPerRequest: null,
    });
  });
});
