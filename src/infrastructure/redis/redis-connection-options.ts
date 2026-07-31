import type { RedisOptions } from 'ioredis';

export function redisConnectionOptions(redisUrl: string): RedisOptions {
  const parsed = new URL(redisUrl);
  const database = parsed.pathname.slice(1);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    db: database ? Number(database) : 0,
    tls: parsed.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}
