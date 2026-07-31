import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('system')
@Controller()
export class AppController {
  @Get()
  @ApiOperation({ summary: 'API metadata' })
  @ApiResponse({ status: 200, description: 'Service metadata.' })
  getMetadata() {
    return {
      name: 'secure-service-desk-api',
      version: '0.1.0',
      status: 'running',
    };
  }
}
