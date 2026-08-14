import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { UsersService } from '../users/users.service';
import { AuthenticationResult, IssuedSession } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { MfaService } from './mfa.service';
import { PasswordHasherService } from './password-hasher.service';
import { SessionService } from './session.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordHasher: PasswordHasherService,
    private readonly auditService: AuditService,
    private readonly mfaService: MfaService,
    private readonly sessionService: SessionService,
  ) {}

  async register(dto: RegisterDto): Promise<IssuedSession> {
    const passwordHash = await this.passwordHasher.hash(dto.password);
    const user = await this.usersService.createUser(dto.email, passwordHash);
    const session = await this.sessionService.issue(user);
    await this.auditService
      .record({
        actorId: user.id,
        action: 'USER_REGISTERED',
        resourceType: 'user',
        resourceId: user.id,
      })
      .catch(() => undefined);
    return session;
  }

  async login(dto: LoginDto): Promise<AuthenticationResult> {
    const user = await this.usersService.findForAuthentication(dto.email);
    if (!user) {
      await this.auditService.record({
        action: 'USER_LOGIN_FAILED',
        resourceType: 'authentication',
        resourceId: this.hashEmail(dto.email),
      });
      throw new UnauthorizedException('Invalid credentials.');
    }
    this.usersService.assertCanAuthenticate(user);
    const validPassword = await this.passwordHasher.verify(dto.password, user.passwordHash);
    if (!validPassword) {
      await this.usersService.registerFailedLogin(user);
      await this.auditService.record({
        actorId: user.id,
        action: 'USER_LOGIN_FAILED',
        resourceType: 'user',
        resourceId: user.id,
      });
      throw new UnauthorizedException('Invalid credentials.');
    }
    if (user.mfaEnabled) {
      const challenge = await this.mfaService.createChallenge(user);
      await this.auditService
        .record({
          actorId: user.id,
          action: 'USER_LOGIN_MFA_REQUIRED',
          resourceType: 'authentication',
          resourceId: user.id,
        })
        .catch(() => undefined);
      return challenge;
    }
    const session = await this.sessionService.issue(user);
    await this.usersService.registerSuccessfulLogin(user);
    await this.auditService
      .record({
        actorId: user.id,
        action: 'USER_LOGIN_SUCCEEDED',
        resourceType: 'session',
        resourceId: user.id,
      })
      .catch(() => undefined);
    return session;
  }

  async loginWithMfa(challengeToken: string, code: string): Promise<IssuedSession> {
    const user = await this.mfaService.completeChallenge(challengeToken, code);
    const session = await this.sessionService.issue(user);
    await this.usersService.registerSuccessfulLogin(user);
    await this.auditService
      .record({
        actorId: user.id,
        action: 'USER_LOGIN_MFA_SUCCEEDED',
        resourceType: 'session',
        resourceId: user.id,
      })
      .catch(() => undefined);
    return session;
  }

  refresh(refreshToken: string): Promise<IssuedSession> {
    return this.sessionService.refresh(refreshToken);
  }

  logout(refreshToken: string | undefined): Promise<void> {
    return this.sessionService.logout(refreshToken);
  }

  private hashEmail(email: string): string {
    return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
  }
}
