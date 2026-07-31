import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Connection } from 'mongoose';
import { CacheService } from '../../infrastructure/cache/cache.service';

@ApiTags('system')
@Controller('health')
export class HealthController {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly cacheService: CacheService,
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Check whether the process is alive' })
  @ApiResponse({ status: 200, description: 'Process is alive.' })
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Check whether required dependencies are ready' })
  @ApiResponse({ status: 200, description: 'Dependencies are ready.' })
  @ApiResponse({ status: 503, description: 'A required dependency is unavailable.' })
  async ready() {
    if (this.connection.readyState !== 1 || !(await this.cacheService.ping())) {
      throw new ServiceUnavailableException('Service dependencies are not ready.');
    }

    return { status: 'ready', dependencies: { mongodb: 'up', redis: 'up' } };
  }
}
