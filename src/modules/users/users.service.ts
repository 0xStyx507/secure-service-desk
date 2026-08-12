import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import { Model } from 'mongoose';
import { Role } from '../auth/roles.enum';
import { User, UserDocument } from './schemas/user.schema';
import {
  RoleMutationLock,
  RoleMutationLockDocument,
} from './schemas/role-mutation-lock.schema';
import { UserStatus } from './user-status.enum';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(RoleMutationLock.name)
    private readonly roleLockModel: Model<RoleMutationLockDocument>,
    private readonly configService: ConfigService,
  ) {}

  async createUser(
    email: string,
    passwordHash: string,
    roles: Role[] = [Role.USER],
  ): Promise<UserDocument> {
    try {
      return await this.userModel.create({
        email: this.normalizeEmail(email),
        passwordHash,
        roles,
        status: UserStatus.ACTIVE,
      });
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException('An account with this email already exists.');
      }

      throw error;
    }
  }

  findForAuthentication(email: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ email: this.normalizeEmail(email) })
      .select('+passwordHash')
      .exec();
  }

  findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  async findActiveSupportUsers(): Promise<Array<{ id: string; email: string; roles: Role[] }>> {
    const users = await this.userModel
      .find({
        status: UserStatus.ACTIVE,
        roles: { $in: [Role.SUPPORT, Role.ADMIN] },
      })
      .select('email roles')
      .sort({ email: 1 })
      .limit(50)
      .lean()
      .exec() as unknown as Array<Pick<User, 'email' | 'roles'> & { _id: unknown }>;
    return users.map((user) => ({ id: String(user._id), email: user.email, roles: user.roles }));
  }

  async setRoles(id: string, roles: Role[]): Promise<UserDocument> {
    const user = await this.userModel.findById(id).exec();
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    const removesAdmin = user.roles.includes(Role.ADMIN) && !roles.includes(Role.ADMIN);
    if (!removesAdmin) {
      user.roles = roles;
      user.authzVersion += 1;
      return user.save();
    }

    const lockOwner = randomUUID();
    await this.acquireAdminRoleLock(lockOwner);
    try {
      const adminCount = await this.userModel.countDocuments({
        roles: Role.ADMIN,
        status: UserStatus.ACTIVE,
      });
      if (adminCount <= 1) {
        throw new ConflictException('The last active administrator cannot be removed.');
      }
      user.roles = roles;
      user.authzVersion += 1;
      return await user.save();
    } finally {
      await this.roleLockModel
        .updateOne(
          { key: 'admin-role-mutation', owner: lockOwner },
          { $unset: { owner: 1, lockedUntil: 1 } },
        )
        .catch(() => undefined);
    }
  }

  async registerFailedLogin(user: UserDocument): Promise<void> {
    const maxAttempts = this.configService.get<number>('maxLoginAttempts') ?? 5;
    const lockSeconds = this.configService.get<number>('loginLockSeconds') ?? 900;
    user.failedLoginAttempts += 1;

    if (user.failedLoginAttempts >= maxAttempts) {
      user.lockedUntil = new Date(Date.now() + lockSeconds * 1_000);
      user.failedLoginAttempts = 0;
    }

    await user.save();
  }

  async registerSuccessfulLogin(user: UserDocument): Promise<void> {
    user.failedLoginAttempts = 0;
    user.lockedUntil = undefined;
    user.lastLoginAt = new Date();
    await user.save();
  }

  assertCanAuthenticate(user: UserDocument): void {
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new UnauthorizedException('Account temporarily locked.');
    }
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private async acquireAdminRoleLock(owner: string): Promise<void> {
    try {
      const lock = await this.roleLockModel
        .findOneAndUpdate(
          {
            key: 'admin-role-mutation',
            $or: [
              { lockedUntil: { $lte: new Date() } },
              { lockedUntil: { $exists: false } },
            ],
          },
          {
            $set: {
              owner,
              lockedUntil: new Date(Date.now() + 10_000),
            },
            $setOnInsert: { key: 'admin-role-mutation' },
          },
          { new: true, upsert: true },
        )
        .exec();
      if (!lock || lock.owner !== owner) {
        throw new ConflictException('Another administrator role change is in progress.');
      }
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException('Another administrator role change is in progress.');
      }
      throw error;
    }
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
  }
}
