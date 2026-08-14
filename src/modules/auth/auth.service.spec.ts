import { Role } from './roles.enum';
import type { UsersService } from '../users/users.service';
import type { UserDocument } from '../users/schemas/user.schema';
import type { PasswordHasherService } from './password-hasher.service';
import type { AuditService } from '../audit/audit.service';
import { AuthService } from './auth.service';
import type { MfaService } from './mfa.service';
import type { SessionService } from './session.service';

function buildLoginService(mfaEnabled: boolean) {
  const user = {
    id: '507f1f77bcf86cd799439011',
    email: 'user@example.com',
    roles: [Role.USER],
    authzVersion: 0,
    mfaEnabled,
    passwordHash: 'stored-password-hash',
  } as UserDocument;
  const usersService = {
    findForAuthentication: jest.fn().mockResolvedValue(user),
    assertCanAuthenticate: jest.fn(),
    registerFailedLogin: jest.fn(),
    registerSuccessfulLogin: jest.fn().mockResolvedValue(undefined),
  } as unknown as UsersService;
  const passwordHasher = {
    verify: jest.fn().mockResolvedValue(true),
  } as unknown as PasswordHasherService;
  const auditService = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuditService;
  const mfaService = {
    createChallenge: jest.fn().mockResolvedValue({
      mfaRequired: true,
      challengeToken: 'challenge-token',
      expiresIn: 300,
    }),
    completeChallenge: jest.fn().mockResolvedValue(user),
  } as unknown as MfaService;
  const issue = jest.fn().mockResolvedValue({
    accessToken: 'signed-access-token',
    accessExpiresIn: 900,
    refreshToken: 'refresh-token',
    refreshExpiresIn: 604_800,
  });
  const sessionService = { issue } as unknown as SessionService;
  const service = new AuthService(
    usersService,
    passwordHasher,
    auditService,
    mfaService,
    sessionService,
  );

  return { service, user, usersService, mfaService, auditService, issue };
}

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
    const auditService = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditService;
    const mfaService = {
      createChallenge: jest.fn(),
    } as unknown as MfaService;
    const issue = jest.fn().mockResolvedValue({
      accessToken: 'signed-access-token',
      accessExpiresIn: 900,
      refreshToken: 'refresh-token',
      refreshExpiresIn: 604_800,
    });
    const sessionService = { issue } as unknown as SessionService;
    const service = new AuthService(
      usersService,
      passwordHasher,
      auditService,
      mfaService,
      sessionService,
    );

    const result = await service.register({
      email: user.email,
      password: 'StrongPassword123',
    });

    expect(passwordHasher.hash).toHaveBeenCalledWith('StrongPassword123');
    expect(usersService.createUser).toHaveBeenCalledWith(user.email, 'scrypt$parameters$salt$hash');
    expect(issue).toHaveBeenCalledWith(user);
    expect(result).toMatchObject({
      accessToken: 'signed-access-token',
      accessExpiresIn: 900,
      refreshExpiresIn: 604_800,
    });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'USER_REGISTERED', actorId: user.id }),
    );
  });

  it('does not record a successful login after password validation when MFA is required', async () => {
    const { service, user, usersService, mfaService, auditService, issue } =
      buildLoginService(true);

    const result = await service.login({
      email: user.email,
      password: 'StrongPassword123',
    });

    expect(result).toEqual({
      mfaRequired: true,
      challengeToken: 'challenge-token',
      expiresIn: 300,
    });
    expect(mfaService.createChallenge).toHaveBeenCalledWith(user);
    expect(usersService.registerSuccessfulLogin).not.toHaveBeenCalled();
    expect(issue).not.toHaveBeenCalled();
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'USER_LOGIN_MFA_REQUIRED' }),
    );
  });

  it('records a successful password-only login after issuing the session', async () => {
    const { service, user, usersService, auditService, issue } = buildLoginService(false);

    const result = await service.login({
      email: user.email,
      password: 'StrongPassword123',
    });

    expect(result).toMatchObject({ accessToken: 'signed-access-token' });
    expect(usersService.registerSuccessfulLogin).toHaveBeenCalledWith(user);
    expect(
      (usersService.registerSuccessfulLogin as jest.Mock).mock.invocationCallOrder[0],
    ).toBeGreaterThan(issue.mock.invocationCallOrder[0] ?? 0);
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'USER_LOGIN_SUCCEEDED' }),
    );
  });

  it('records a successful login only after MFA consumes the challenge and issues a session', async () => {
    const { service, user, usersService, auditService, issue } = buildLoginService(true);

    const result = await service.loginWithMfa('challenge-token', '123456');

    expect(result).toMatchObject({ accessToken: 'signed-access-token' });
    expect(usersService.registerSuccessfulLogin).toHaveBeenCalledWith(user);
    expect(
      (usersService.registerSuccessfulLogin as jest.Mock).mock.invocationCallOrder[0],
    ).toBeGreaterThan(issue.mock.invocationCallOrder[0] ?? 0);
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'USER_LOGIN_MFA_SUCCEEDED' }),
    );
  });
});
