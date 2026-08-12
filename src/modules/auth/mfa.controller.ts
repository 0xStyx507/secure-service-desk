import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from './auth.types';
import { MfaCodeDto } from './dto/mfa-code.dto';
import { DisableMfaDto } from './dto/disable-mfa.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { MfaService } from './mfa.service';

@ApiTags('auth')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('auth/mfa')
export class MfaController {
  constructor(private readonly mfaService: MfaService) {}

  @Get('status')
  @ApiOperation({ summary: 'Return MFA status for the authenticated user' })
  status(@Req() request: AuthenticatedRequest) {
    return this.mfaService.status(request.user.sub);
  }

  @Post('setup')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'Generate a TOTP secret for optional MFA setup' })
  @ApiResponse({ status: 201, description: 'Secret and authenticator URI. Display the secret only during setup.' })
  setup(@Req() request: AuthenticatedRequest) {
    return this.mfaService.setup(request.user.sub);
  }

  @Post('verify-setup')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(204)
  @ApiOperation({ summary: 'Verify the TOTP code and enable MFA' })
  async verifySetup(@Body() dto: MfaCodeDto, @Req() request: AuthenticatedRequest): Promise<void> {
    await this.mfaService.verifySetup(request.user.sub, dto.code);
  }

  @Post('disable')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(204)
  @ApiOperation({ summary: 'Disable MFA after verifying the current TOTP code' })
  async disable(@Body() dto: DisableMfaDto, @Req() request: AuthenticatedRequest): Promise<void> {
    await this.mfaService.disable(request.user.sub, dto.password, dto.code);
  }
}
