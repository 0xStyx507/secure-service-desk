import { ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { Role } from './roles.enum';

describe('RolesGuard', () => {
  it('allows a user with a required role', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue([Role.SUPPORT]) };
    const guard = new RolesGuard(reflector as never);
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => ({ user: { roles: [Role.SUPPORT] } }) }),
    } as never;

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects a user without a required role', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue([Role.ADMIN]) };
    const guard = new RolesGuard(reflector as never);
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => ({ user: { roles: [Role.USER] } }) }),
    } as never;

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
