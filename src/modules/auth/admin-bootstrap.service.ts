import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditService } from '../audit/audit.service';
import { UsersService } from '../users/users.service';
import { PasswordHasherService } from './password-hasher.service';
import { Role } from './roles.enum';
import {
  AdminBootstrapState,
  AdminBootstrapStateDocument,
} from './schemas/admin-bootstrap-state.schema';

@Injectable()
export class AdminBootstrapService implements OnApplicationBootstrap {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly passwordHasher: PasswordHasherService,
    private readonly auditService: AuditService,
    @InjectModel(AdminBootstrapState.name)
    private readonly bootstrapStateModel: Model<AdminBootstrapStateDocument>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const email = this.configService.get<string>('bootstrapAdminEmail');
    const password = this.configService.get<string>('bootstrapAdminPassword');
    if (!email || !password) {
      return;
    }
    const completed = await this.bootstrapStateModel.exists({ key: 'initial-admin' });
    if (completed) {
      return;
    }

    const existing = await this.usersService.findForAuthentication(email);
    if (existing) {
      if (!existing.roles.includes(Role.ADMIN)) {
        throw new Error('Bootstrap email already belongs to a non-admin account.');
      }
      await this.markCompleted();
      return;
    }
    const passwordHash = await this.passwordHasher.hash(password);
    let admin;
    try {
      admin = await this.usersService.createUser(email, passwordHash, [Role.ADMIN]);
    } catch {
      const concurrentAdmin = await this.usersService.findForAuthentication(email);
      if (!concurrentAdmin?.roles.includes(Role.ADMIN)) {
        throw new Error('Initial administrator could not be created.');
      }
      await this.markCompleted();
      return;
    }
    await this.auditService.record({
      actorId: admin.id,
      action: 'ADMIN_BOOTSTRAPPED',
      resourceType: 'user',
      resourceId: admin.id,
    });
    await this.markCompleted();
  }

  private async markCompleted(): Promise<void> {
    await this.bootstrapStateModel.updateOne(
      { key: 'initial-admin' },
      {
        $setOnInsert: {
          key: 'initial-admin',
          completedAt: new Date(),
        },
      },
      { upsert: true },
    );
  }
}
