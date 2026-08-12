import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { CacheService } from './infrastructure/cache/cache.service';
import { AttachmentsController } from './modules/attachments/attachments.controller';
import { AttachmentsService } from './modules/attachments/attachments.service';
import { AuthController } from './modules/auth/auth.controller';
import { AuthService } from './modules/auth/auth.service';
import { CsrfService } from './modules/auth/csrf.service';
import { JwtTokenService } from './modules/auth/jwt-token.service';
import { GovernanceController } from './modules/governance/governance.controller';
import { DeadLetterAdminService } from './modules/governance/dead-letter-admin.service';
import { AuditService } from './modules/audit/audit.service';
import { HealthController } from './modules/health/health.controller';
import { NotificationsController } from './modules/notifications/notifications.controller';
import { NotificationsService } from './modules/notifications/notifications.service';
import { ReportsController } from './modules/reports/reports.controller';
import { ReportsService } from './modules/reports/reports.service';
import { TicketsController } from './modules/tickets/tickets.controller';
import { TicketsService } from './modules/tickets/tickets.service';
import { UsersService } from './modules/users/users.service';
import { McpController } from './modules/mcp/mcp.controller';
import { McpToolsService } from './modules/mcp/mcp-tools.service';
import { MfaController } from './modules/auth/mfa.controller';
import { MfaService } from './modules/auth/mfa.service';
import { createOpenApiDocument } from './openapi';

/**
 * Documentation-only composition. It keeps controller metadata and DTO
 * schemas while avoiding MongoDB, Redis and BullMQ connections during export.
 */
@Module({
  controllers: [
    AppController,
    HealthController,
    AuthController,
    TicketsController,
    AttachmentsController,
    ReportsController,
    NotificationsController,
    GovernanceController,
    McpController,
    MfaController,
  ],
  providers: [
    { provide: ConfigService, useValue: new ConfigService() },
    { provide: Reflector, useValue: {} },
    { provide: getConnectionToken(), useValue: {} },
    { provide: CacheService, useValue: {} },
    { provide: AuthService, useValue: {} },
    { provide: CsrfService, useValue: {} },
    { provide: JwtTokenService, useValue: {} },
    { provide: TicketsService, useValue: {} },
    { provide: AttachmentsService, useValue: {} },
    { provide: ReportsService, useValue: {} },
    { provide: NotificationsService, useValue: {} },
    { provide: AuditService, useValue: {} },
    { provide: UsersService, useValue: {} },
    { provide: DeadLetterAdminService, useValue: {} },
    { provide: McpToolsService, useValue: {} },
    { provide: MfaService, useValue: {} },
  ],
})
class OpenApiModule {}

async function exportOpenApi(): Promise<void> {
  const app = await NestFactory.create(OpenApiModule, {
    logger: false,
    abortOnError: false,
  });
  const document = createOpenApiDocument(app);
  const outputPath = resolve(process.cwd(), 'docs/openapi.json');

  await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  await app.close();
}

if (require.main === module) {
  void exportOpenApi().catch((error: unknown) => {
    const detail = error instanceof Error ? (error.stack ?? error.message) : JSON.stringify(error);
    console.error(`OpenAPI export failed: ${detail}`);
    process.exitCode = 1;
  });
}
