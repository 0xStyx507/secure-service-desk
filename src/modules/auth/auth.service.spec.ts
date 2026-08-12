import { ConfigService } from '@nestjs/config';
import type { Model } from 'mongoose';
import { Role } from './roles.enum';
import type { RefreshSessionDocument } from './schemas/refresh-session.schema';
import type { UsersService } from '../users/users.service';
import type { UserDocument } from '../users/schemas/user.schema';
import type { JwtTokenService } from './jwt-token.service';
import type { PasswordHasherService } from './password-hasher.service';
import type { AuditService } from '../audit/audit.service';
import { AuthService } from './auth.service';
import type { MfaService } from './mfa.service';

describe('AuthService', () => {
  it('hashes credentials and persists only the refresh token hash on registration', async () => {
    const user = {
      id: '507f1f77bcf86cd799439011',
      email: 'user@example.com',
      roles: [Role.USER],
      authzVersion: 0,
    } as UserDocument;
    const usersService = {
      createUser: jest.fn().mockResolvedValue(user),
    } as unknown as UsersService;
    const passwordHasher = {
      hash: jest.fn().mockResolvedValue('scrypt$parameters$salt$hash'),
    } as unknown as PasswordHasherService;
    const jwtTokenService = {
      signAccessToken: jest.fn().mockResolvedValue('signed-access-token'),
    } as unknown as JwtTokenService;
    const create = jest.fn().mockResolvedValue({});
    const refreshSessionModel = { create } as unknown as Model<RefreshSessionDocument>;
    const auditService = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditService;
    const mfaService = {
      createChallenge: jest.fn(),
    } as unknown as MfaService;
    const configService = new ConfigService({
      jwtAccessTtlSeconds: 900,
      refreshTokenTtlSeconds: 604_800,
    });
    const service = new AuthService(
      usersService,
      passwordHasher,
      jwtTokenService,
      configService,
      auditService,
      mfaService,
      refreshSessionModel,
    );

    const result = await service.register({
      email: user.email,
      password: 'StrongPassword123',
    });

    expect(passwordHasher.hash).toHaveBeenCalledWith('StrongPassword123');
    expect(usersService.createUser).toHaveBeenCalledWith(
      user.email,
      'scrypt$parameters$salt$hash',
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        familyId: expect.any(String),
        expiresAt: expect.any(Date),
      }),
    );
    expect(create.mock.calls[0]?.[0].tokenHash).not.toBe(result.refreshToken);
    expect(result).toMatchObject({
      accessToken: 'signed-access-token',
      accessExpiresIn: 900,
      refreshExpiresIn: 604_800,
    });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'USER_REGISTERED', actorId: user.id }),
    );
  });
});
