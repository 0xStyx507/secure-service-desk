import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { GovernanceModule } from '../governance/governance.module';
import { TicketsModule } from '../tickets/tickets.module';
import { UsersModule } from '../users/users.module';
import { KnowledgeArticle, KnowledgeArticleSchema } from './schemas/knowledge-article.schema';
import {
  McpPendingAction,
  McpPendingActionSchema,
} from '../governance/schemas/mcp-pending-action.schema';
import { KnowledgeBaseService } from './knowledge-base.service';
import { McpActionService } from './mcp-action.service';
import { McpController } from './mcp.controller';
import { McpToolsService } from './mcp-tools.service';

@Module({
  imports: [
    AuditModule,
    AuthModule,
    GovernanceModule,
    TicketsModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: KnowledgeArticle.name, schema: KnowledgeArticleSchema },
      { name: McpPendingAction.name, schema: McpPendingActionSchema },
    ]),
  ],
  controllers: [McpController],
  providers: [KnowledgeBaseService, McpActionService, McpToolsService],
})
export class McpModule {}
