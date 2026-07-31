import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest, IssuedSession } from './auth.types';
import { CsrfService } from './csrf.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly csrfService: CsrfService,
    private readonly configService: ConfigService,
  ) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Register a user with the USER role' })
  @ApiResponse({ status: 201, description: 'Account created.' })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Record<string, unknown>> {
    return this.completeAuthentication(await this.authService.register(dto), response);
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @ApiOperation({ summary: 'Authenticate with email and password' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Record<string, unknown>> {
    return this.completeAuthentication(await this.authService.login(dto), response);
  }

  @Post('refresh')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate the refresh session and issue an access token' })
  async refresh(
    @Req() request: Request,
    @Headers('x-csrf-token') csrfHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Record<string, unknown>> {
    this.assertTrustedOrigin(request);
    const cookies = this.parseCookies(request.headers.cookie);
    this.csrfService.assertValid(cookies[this.csrfCookieName], csrfHeader);
    const refreshToken = cookies[this.refreshCookieName];
    if (!refreshToken) {
      throw new UnauthorizedException('Invalid refresh session.');
    }

    return this.completeAuthentication(await this.authService.refresh(refreshToken), response);
  }

  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke the current refresh session' })
  async logout(
    @Req() request: Request,
    @Headers('x-csrf-token') csrfHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    this.assertTrustedOrigin(request);
    const cookies = this.parseCookies(request.headers.cookie);
    this.csrfService.assertValid(cookies[this.csrfCookieName], csrfHeader);
    await this.authService.logout(cookies[this.refreshCookieName]);
    this.clearSessionCookies(response);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Return the authenticated identity' })
  getCurrentUser(@Req() request: AuthenticatedRequest) {
    return request.user;
  }

  private completeAuthentication(
    session: IssuedSession,
    response: Response,
  ): Record<string, unknown> {
    const csrfToken = this.csrfService.issue();
    response.cookie(this.refreshCookieName, session.refreshToken, {
      httpOnly: true,
      secure: this.cookieSecure,
      sameSite: 'strict',
      path: this.cookiePath,
      maxAge: session.refreshExpiresIn * 1_000,
    });
    response.cookie(this.csrfCookieName, csrfToken, {
      httpOnly: false,
      secure: this.cookieSecure,
      sameSite: 'strict',
      path: this.cookiePath,
      maxAge: session.refreshExpiresIn * 1_000,
    });

    return {
      accessToken: session.accessToken,
      tokenType: 'Bearer',
      expiresIn: session.accessExpiresIn,
      csrfToken,
    };
  }

  private clearSessionCookies(response: Response): void {
    const options = {
      secure: this.cookieSecure,
      sameSite: 'strict' as const,
      path: this.cookiePath,
    };
    response.clearCookie(this.refreshCookieName, { ...options, httpOnly: true });
    response.clearCookie(this.csrfCookieName, { ...options, httpOnly: false });
  }

  private parseCookies(cookieHeader: string | undefined): Record<string, string> {
    if (!cookieHeader) {
      return {};
    }
    if (cookieHeader.length > 4_096) {
      throw new UnauthorizedException('Invalid cookie header.');
    }

    return cookieHeader.split(';').reduce<Record<string, string>>((cookies, item) => {
      const separator = item.indexOf('=');
      if (separator > 0) {
        const name = item.slice(0, separator).trim();
        if (Object.hasOwn(cookies, name)) {
          throw new UnauthorizedException('Duplicate authentication cookie.');
        }
        try {
          cookies[name] = decodeURIComponent(item.slice(separator + 1).trim());
        } catch {
          throw new UnauthorizedException('Invalid cookie header.');
        }
      }
      return cookies;
    }, {});
  }

  private get refreshCookieName(): string {
    return this.configService.get<string>('refreshCookieName') ?? 'service_desk_refresh';
  }

  private get csrfCookieName(): string {
    return this.configService.get<string>('csrfCookieName') ?? 'service_desk_csrf';
  }

  private get cookieSecure(): boolean {
    return this.configService.get<boolean>('cookieSecure') ?? false;
  }

  private get cookiePath(): string {
    return this.refreshCookieName.startsWith('__Host-') ? '/' : '/api/auth';
  }

  private assertTrustedOrigin(request: Request): void {
    const origin = request.header('origin');
    if (!origin) {
      return;
    }
    const allowedOrigins = this.configService.get<string[]>('corsOrigins') ?? [];
    if (!allowedOrigins.includes(origin)) {
      throw new UnauthorizedException('Request origin is not allowed.');
    }
  }
}
