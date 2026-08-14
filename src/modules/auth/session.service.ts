import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Model, Types } from 'mongoose';
import { AuditService } from '../audit/audit.service';
import { UserDocument } from '../users/schemas/user.schema';
import { UsersService } from '../users/users.service';
import { IssuedSession } from './auth.types';
import { JwtTokenService } from './jwt-token.service';
import { RefreshSession, RefreshSessionDocument } from './schemas/refresh-session.schema';

@Injectable()
export class SessionService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtTokenService: JwtTokenService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    @InjectModel(RefreshSession.name)
    private readonly refreshSessionModel: Model<RefreshSessionDocument>,
  ) {}

  async issue(
    user: UserDocument,
    familyId: string = randomUUID(),
    refreshToken: string = this.generateRefreshToken(),
  ): Promise<IssuedSession> {
    const accessExpiresIn = this.configService.get<number>('jwtAccessTtlSeconds') ?? 900;
    const refreshExpiresIn = this.configService.get<number>('refreshTokenTtlSeconds') ?? 604_800;
    await this.refreshSessionModel.create({
      userId: new Types.ObjectId(user.id),
      tokenHash: this.hashToken(refreshToken),
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

  async refresh(refreshToken: string): Promise<IssuedSession> {
    const session = await this.refreshSessionModel
      .findOne({ tokenHash: this.hashToken(refreshToken) })
      .exec();
    if (!session) throw new UnauthorizedException('Invalid refresh session.');
    if (session.revokedAt) {
      await this.revokeFamily(session.familyId, 'REUSE_DETECTED');
      await this.auditService.recordCritical({
        actorId: session.userId.toString(),
        action: 'REFRESH_TOKEN_REUSE_DETECTED',
        resourceType: 'session',
        resourceId: session.familyId,
      });
      throw new UnauthorizedException('Refresh token reuse detected.');
    }
    if (session.expiresAt.getTime() <= Date.now())
      throw new UnauthorizedException('Refresh session expired.');
    const user = await this.usersService.findById(session.userId.toString());
    if (!user) throw new UnauthorizedException('Invalid refresh session.');
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
    const issuedSession = await this.issue(user, session.familyId, nextRefreshToken);
    await this.auditService
      .record({
        actorId: user.id,
        action: 'SESSION_REFRESHED',
        resourceType: 'session',
        resourceId: session.familyId,
      })
      .catch(() => undefined);
    return issuedSession;
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
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
