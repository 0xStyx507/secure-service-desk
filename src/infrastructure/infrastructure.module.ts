import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheService } from './cache/cache.service';
import { CloudModule } from './cloud/cloud.module';
import { redisConnectionOptions } from './redis/redis-connection-options';
import { RequestContextService } from './context/request-context.service';

@Global()
@Module({
  imports: [
    ConfigModule,
    CloudModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: redisConnectionOptions(configService.get<string>('redisUrl')!),
      }),
    }),
  ],
  providers: [CacheService, RequestContextService],
  exports: [CacheService, RequestContextService, BullModule, CloudModule],
})
export class InfrastructureModule {}
