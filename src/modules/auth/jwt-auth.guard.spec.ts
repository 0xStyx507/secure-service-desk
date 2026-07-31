import { UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  it('rejects requests without a bearer access token', async () => {
    const verifier = { verifyAccessToken: jest.fn() };
    const users = { findById: jest.fn() };
    const guard = new JwtAuthGuard(verifier as never, users as never);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ header: () => undefined }),
      }),
    } as never;

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    expect(verifier.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('verifies and attaches a bearer identity to the request', async () => {
    const user = {
      sub: '507f1f77bcf86cd799439011',
      email: 'user@example.com',
      roles: ['USER'],
      authzVersion: 0,
    };
    const verifier = { verifyAccessToken: jest.fn().mockResolvedValue(user) };
    const users = {
      findById: jest.fn().mockResolvedValue({
        email: user.email,
        roles: user.roles,
        status: 'ACTIVE',
        authzVersion: 0,
      }),
    };
    const guard = new JwtAuthGuard(verifier as never, users as never);
    const request = { header: () => 'Bearer signed-token' };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as never;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(verifier.verifyAccessToken).toHaveBeenCalledWith('signed-token');
    expect(request).toHaveProperty('user', user);
  });

  it('rejects a token issued before a role change', async () => {
    const verifier = {
      verifyAccessToken: jest.fn().mockResolvedValue({
        sub: '507f1f77bcf86cd799439011',
        email: 'admin@example.com',
        roles: ['ADMIN'],
        authzVersion: 1,
      }),
    };
    const users = {
      findById: jest.fn().mockResolvedValue({
        status: 'ACTIVE',
        authzVersion: 2,
      }),
    };
    const guard = new JwtAuthGuard(verifier as never, users as never);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ header: () => 'Bearer stale-token' }),
      }),
    } as never;

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });
});
