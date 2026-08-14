import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ParseMongoIdPipe } from '../../common/pipes/parse-mongo-id.pipe';
import { AuditService } from '../audit/audit.service';
import { ListAuditEventsDto } from '../audit/dto/list-audit-events.dto';
import { AuthenticatedRequest } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Role } from '../auth/roles.enum';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UsersService } from '../users/users.service';
import { UpdateUserRolesDto } from './dto/update-user-roles.dto';
import { ListJobFailuresDto } from './dto/list-job-failures.dto';
import { DeadLetterAdminService } from './dead-letter-admin.service';

@ApiTags('governance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin')
export class GovernanceController {
  constructor(
    private readonly auditService: AuditService,
    private readonly usersService: UsersService,
    private readonly deadLetterAdminService: DeadLetterAdminService,
  ) {}

  @Get('audit-events')
  @ApiOperation({ summary: 'List append-only audit events' })
  listAuditEvents(@Query() query: ListAuditEventsDto) {
    return this.auditService.list(query);
  }

  @Patch('users/:id/roles')
  @ApiOperation({ summary: 'Replace a user role set without removing the final admin' })
  async updateRoles(
    @Param('id', ParseMongoIdPipe) id: string,
    @Body() dto: UpdateUserRolesDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const user = await this.usersService.setRoles(id, dto.roles);
    await this.auditService.recordCritical({
      actorId: request.user.sub,
      action: 'USER_ROLES_UPDATED',
      resourceType: 'user',
      resourceId: user.id,
      metadata: { roles: user.roles },
    });
    return {
      id: user.id,
      email: user.email,
      roles: user.roles,
      status: user.status,
    };
  }

  @Get('job-failures')
  @ApiOperation({ summary: 'List dead-letter and reprocessed jobs' })
  listJobFailures(@Query() query: ListJobFailuresDto) {
    return this.deadLetterAdminService.list(query);
  }

  @Post('job-failures/:id/reprocess')
  @ApiOperation({ summary: 'Reprocess an allowlisted dead-letter job once' })
  async reprocessJob(
    @Param('id', ParseMongoIdPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.deadLetterAdminService.reprocess(id, request.user.sub);
  }
}
