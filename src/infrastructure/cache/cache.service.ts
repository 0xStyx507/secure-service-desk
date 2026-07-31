import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor(private readonly configService: ConfigService) {
    this.client = new Redis(this.configService.get<string>('redisUrl')!, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
    this.client.on('error', () => undefined);
  }

  async getJson<T>(key: string): Promise<T | undefined> {
    try {
      await this.connect();
      const value = await this.client.get(key);
      return value ? (JSON.parse(value) as T) : undefined;
    } catch {
      return undefined;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    try {
      await this.connect();
      const ttl = ttlSeconds ?? this.configService.get<number>('cacheTtlSeconds') ?? 30;
      await this.client.set(key, JSON.stringify(value), 'EX', ttl);
    } catch {
      // Cache is an optimization. MongoDB remains the source of truth.
    }
  }

  async getVersion(namespace: string): Promise<number> {
    const key = `cache-version:${namespace}`;
    try {
      await this.connect();
      await this.client.set(key, '1', 'NX');
      return Number((await this.client.get(key)) ?? 1);
    } catch {
      return Date.now();
    }
  }

  async invalidate(namespace: string): Promise<void> {
    try {
      await this.connect();
      await this.client.incr(`cache-version:${namespace}`);
    } catch {
      // A cache outage must not fail the source-of-truth mutation.
    }
  }

  async ping(): Promise<boolean> {
    try {
      await this.connect();
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status !== 'end') {
      await this.client.quit().catch(() => this.client.disconnect());
    }
  }

  private async connect(): Promise<void> {
    if (this.client.status === 'wait') {
      await this.client.connect();
    }
  }
}
