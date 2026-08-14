import { ConfigService } from '@nestjs/config';
import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import { Role } from '../auth/roles.enum';
import type { UserDocument } from './schemas/user.schema';
import { UsersService } from './users.service';
import { UserStatus } from './user-status.enum';

describe('UsersService', () => {
  it('uses an atomic conditional pipeline for failed login attempts', async () => {
    const exec = jest.fn().mockResolvedValue(undefined);
    const findOneAndUpdate = jest.fn().mockReturnValue({ exec });
    const userModel = { findOneAndUpdate } as unknown as Model<UserDocument>;
    const service = new UsersService(
      userModel,
      {} as never,
      new ConfigService({ maxLoginAttempts: 5, loginLockSeconds: 900 }),
    );
    const userId = new Types.ObjectId();
    const staleUser = {
      _id: userId,
      id: userId.toString(),
      email: 'user@example.com',
      roles: [Role.USER],
      status: UserStatus.ACTIVE,
      failedLoginAttempts: 2,
      save: jest.fn(),
    } as unknown as UserDocument;

    await service.registerFailedLogin(staleUser);

    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [filter, pipeline, options] = findOneAndUpdate.mock.calls[0] as [
      Record<string, unknown>,
      Array<Record<string, unknown>>,
      Record<string, unknown>,
    ];
    expect(filter).toEqual({
      _id: userId,
      $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: { $lte: expect.any(Date) } }],
    });
    expect(pipeline[0]).toEqual({
      $set: {
        failedLoginAttempts: {
          $add: [{ $ifNull: ['$failedLoginAttempts', 0] }, 1],
        },
      },
    });
    expect(pipeline[1]).toMatchObject({
      $set: {
        failedLoginAttempts: {
          $cond: [{ $gte: ['$failedLoginAttempts', 5] }, 0, '$failedLoginAttempts'],
        },
      },
    });
    expect(options).toEqual({ new: true });
    expect(staleUser.save).not.toHaveBeenCalled();
    expect(exec).toHaveBeenCalledTimes(1);
  });
});
