import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../audit/audit.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CsrfService } from './csrf.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtTokenService } from './jwt-token.service';
import { PasswordHasherService } from './password-hasher.service';
import { RolesGuard } from './roles.guard';
import { RefreshSession, RefreshSessionSchema } from './schemas/refresh-session.schema';
import { AdminBootstrapService } from './admin-bootstrap.service';
import {
  AdminBootstrapState,
  AdminBootstrapStateSchema,
} from './schemas/admin-bootstrap-state.schema';

@Module({
  imports: [
    AuditModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: RefreshSession.name, schema: RefreshSessionSchema },
      { name: AdminBootstrapState.name, schema: AdminBootstrapStateSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordHasherService,
    JwtTokenService,
    CsrfService,
    JwtAuthGuard,
    RolesGuard,
    AdminBootstrapService,
  ],
  exports: [UsersModule, JwtAuthGuard, RolesGuard, JwtTokenService],
})
export class AuthModule {}
