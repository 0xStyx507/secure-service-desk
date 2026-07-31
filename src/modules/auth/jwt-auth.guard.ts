import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedRequest } from './auth.types';
import { JwtTokenService } from './jwt-token.service';
import { UsersService } from '../users/users.service';
import { UserStatus } from '../users/user-status.enum';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtTokenService: JwtTokenService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.header('authorization');
    const [scheme, token] = authorization?.split(' ') ?? [];

    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException('Bearer access token is required.');
    }

    const identity = await this.jwtTokenService.verifyAccessToken(token);
    const user = await this.usersService.findById(identity.sub);
    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      user.authzVersion !== identity.authzVersion
    ) {
      throw new UnauthorizedException('Access token is no longer valid.');
    }
    request.user = {
      ...identity,
      email: user.email,
      roles: user.roles,
      authzVersion: user.authzVersion,
    };
    return true;
  }
}
