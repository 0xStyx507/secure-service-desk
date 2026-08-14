import { ConfigService } from '@nestjs/config';
import type { Model } from 'mongoose';
import { Role } from './roles.enum';
import { SessionService } from './session.service';
import type { RefreshSessionDocument } from './schemas/refresh-session.schema';
import type { UsersService } from '../users/users.service';
import type { JwtTokenService } from './jwt-token.service';
import type { AuditService } from '../audit/audit.service';
import type { UserDocument } from '../users/schemas/user.schema';

function queryResult<T>(value: T) {
  return { exec: jest.fn().mockResolvedValue(value) };
}

describe('SessionService', () => {
  it('stores only a hash when issuing a refresh session', async () => {
    const create = jest.fn().mockResolvedValue({});
    const jwtTokenService = {
      signAccessToken: jest.fn().mockResolvedValue('access-token'),
    } as unknown as JwtTokenService;
    const service = new SessionService(
      {} as UsersService,
      jwtTokenService,
      new ConfigService({ jwtAccessTtlSeconds: 900, refreshTokenTtlSeconds: 604_800 }),
      {} as AuditService,
      { create } as unknown as Model<RefreshSessionDocument>,
    );
    const user = { id: '507f1f77bcf86cd799439011', roles: [Role.USER] } as UserDocument;

    const result = await service.issue(user, 'family-1', 'plain-refresh-token');

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        familyId: 'family-1',
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        expiresAt: expect.any(Date),
      }),
    );
    expect(create.mock.calls[0]?.[0].tokenHash).not.toBe(result.refreshToken);
    expect(result).toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'plain-refresh-token',
    });
  });

  it('revokes the family and emits critical audit on refresh reuse', async () => {
    const updateMany = jest.fn().mockReturnValue(queryResult({}));
    const recordCritical = jest.fn().mockResolvedValue(undefined);
    const service = new SessionService(
      {} as UsersService,
      {} as JwtTokenService,
      {} as ConfigService,
      { recordCritical } as unknown as AuditService,
      {
        findOne: jest.fn().mockReturnValue(
          queryResult({
            userId: { toString: () => 'user-1' },
            familyId: 'family-1',
            revokedAt: new Date(),
          }),
        ),
        updateMany,
      } as unknown as Model<RefreshSessionDocument>,
    );

    await expect(service.refresh('reused-token')).rejects.toThrow('reuse detected');
    expect(updateMany).toHaveBeenCalled();
    expect(recordCritical).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'REFRESH_TOKEN_REUSE_DETECTED',
        resourceId: 'family-1',
      }),
    );
  });
});
