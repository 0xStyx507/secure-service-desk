import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Model, Types } from 'mongoose';
import { AuditService } from '../audit/audit.service';
import { UserDocument } from '../users/schemas/user.schema';
import { UsersService } from '../users/users.service';
import { IssuedSession } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtTokenService } from './jwt-token.service';
import { PasswordHasherService } from './password-hasher.service';
import { RefreshSession, RefreshSessionDocument } from './schemas/refresh-session.schema';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordHasher: PasswordHasherService,
    private readonly jwtTokenService: JwtTokenService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    @InjectModel(RefreshSession.name)
    private readonly refreshSessionModel: Model<RefreshSessionDocument>,
  ) {}

  async register(dto: RegisterDto): Promise<IssuedSession> {
    const passwordHash = await this.passwordHasher.hash(dto.password);
    const user = await this.usersService.createUser(dto.email, passwordHash);
    const session = await this.issueSession(user);
    await this.auditService.record({
      actorId: user.id,
      action: 'USER_REGISTERED',
      resourceType: 'user',
      resourceId: user.id,
    }).catch(() => undefined);
    return session;
  }

  async login(dto: LoginDto): Promise<IssuedSession> {
    const user = await this.usersService.findForAuthentication(dto.email);
    if (!user) {
      await this.auditService
        .record({
          action: 'USER_LOGIN_FAILED',
          resourceType: 'authentication',
          resourceId: this.hashToken(dto.email.trim().toLowerCase()),
        })
        .catch(() => undefined);
      throw new UnauthorizedException('Invalid credentials.');
    }

    this.usersService.assertCanAuthenticate(user);
    const validPassword = await this.passwordHasher.verify(dto.password, user.passwordHash);
    if (!validPassword) {
      await this.usersService.registerFailedLogin(user);
      await this.auditService
        .record({
          actorId: user.id,
          action: 'USER_LOGIN_FAILED',
          resourceType: 'user',
          resourceId: user.id,
        })
        .catch(() => undefined);
      throw new UnauthorizedException('Invalid credentials.');
    }

    await this.usersService.registerSuccessfulLogin(user);
    const session = await this.issueSession(user);
    await this.auditService.record({
      actorId: user.id,
      action: 'USER_LOGIN_SUCCEEDED',
      resourceType: 'session',
      resourceId: user.id,
    }).catch(() => undefined);
    return session;
  }

  async refresh(refreshToken: string): Promise<IssuedSession> {
    const tokenHash = this.hashToken(refreshToken);
    const session = await this.refreshSessionModel.findOne({ tokenHash }).exec();

    if (!session) {
      throw new UnauthorizedException('Invalid refresh session.');
    }

    if (session.revokedAt) {
      await this.revokeFamily(session.familyId, 'REUSE_DETECTED');
      await this.auditService
        .record({
          actorId: session.userId.toString(),
          action: 'REFRESH_TOKEN_REUSE_DETECTED',
          resourceType: 'session',
          resourceId: session.familyId,
        })
        .catch(() => undefined);
      throw new UnauthorizedException('Refresh token reuse detected.');
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh session expired.');
    }

    const user = await this.usersService.findById(session.userId.toString());
    if (!user) {
      throw new UnauthorizedException('Invalid refresh session.');
    }

    this.usersService.assertCanAuthenticate(user);
    const nextRefreshToken = this.generateRefreshToken();
    const nextTokenHash = this.hashToken(nextRefreshToken);
    const rotated = await this.refreshSessionModel
      .findOneAndUpdate(
        { _id: session._id, revokedAt: { $exists: false } },
        {
          $set: {
            revokedAt: new Date(),
            revokeReason: 'ROTATED',
            replacedByTokenHash: nextTokenHash,
          },
        },
        { new: true },
      )
      .exec();

    if (!rotated) {
      await this.revokeFamily(session.familyId, 'CONCURRENT_REUSE');
      throw new UnauthorizedException('Refresh token reuse detected.');
    }

    const issuedSession = await this.issueSession(user, session.familyId, nextRefreshToken);
    await this.auditService.record({
      actorId: user.id,
      action: 'SESSION_REFRESHED',
      resourceType: 'session',
      resourceId: session.familyId,
    }).catch(() => undefined);
    return issuedSession;
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) {
      return;
    }

    const session = await this.refreshSessionModel
      .findOneAndUpdate(
        { tokenHash: this.hashToken(refreshToken), revokedAt: { $exists: false } },
        { $set: { revokedAt: new Date(), revokeReason: 'LOGOUT' } },
        { new: true },
      )
      .exec();
    if (session) {
      await this.auditService
        .record({
          actorId: session.userId.toString(),
          action: 'SESSION_LOGGED_OUT',
          resourceType: 'session',
          resourceId: session.familyId,
        })
        .catch(() => undefined);
    }
  }

  private async issueSession(
    user: UserDocument,
    familyId: string = randomUUID(),
    refreshToken: string = this.generateRefreshToken(),
  ): Promise<IssuedSession> {
    const accessExpiresIn = this.configService.get<number>('jwtAccessTtlSeconds') ?? 900;
    const refreshExpiresIn = this.configService.get<number>('refreshTokenTtlSeconds') ?? 604_800;
    const tokenHash = this.hashToken(refreshToken);

    await this.refreshSessionModel.create({
      userId: new Types.ObjectId(user.id),
      tokenHash,
      familyId,
      expiresAt: new Date(Date.now() + refreshExpiresIn * 1_000),
    });

    return {
      accessToken: await this.jwtTokenService.signAccessToken(user),
      accessExpiresIn,
      refreshToken,
      refreshExpiresIn,
    };
  }

  private generateRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async revokeFamily(familyId: string, reason: string): Promise<void> {
    await this.refreshSessionModel
      .updateMany(
        { familyId, revokedAt: { $exists: false } },
        { $set: { revokedAt: new Date(), revokeReason: reason } },
      )
      .exec();
  }
}
