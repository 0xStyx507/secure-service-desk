import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

@Injectable()
export class MetricsAccessGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.configService.get<boolean>('metricsEnabled', false)) {
      throw new NotFoundException();
    }

    const expectedToken = this.configService.get<string>('metricsToken', '');
    const request = context.switchToHttp().getRequest<Request>();
    const providedToken = this.extractToken(request);

    if (!providedToken || !this.matches(providedToken, expectedToken)) {
      throw new UnauthorizedException('Metrics authentication required');
    }

    return true;
  }

  private extractToken(request: Request): string | undefined {
    const header = request.header('x-metrics-token');
    if (header) {
      return header;
    }

    const authorization = request.header('authorization');
    if (authorization?.startsWith('Bearer ')) {
      return authorization.slice('Bearer '.length).trim();
    }

    return undefined;
  }

  private matches(providedToken: string, expectedToken: string): boolean {
    const providedDigest = createHash('sha256').update(providedToken).digest();
    const expectedDigest = createHash('sha256').update(expectedToken).digest();
    return timingSafeEqual(providedDigest, expectedDigest);
  }
}
