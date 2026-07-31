import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import {
  TicketComment,
  TicketCommentSchema,
} from './schemas/ticket-comment.schema';
import { TicketCounter, TicketCounterSchema } from './schemas/ticket-counter.schema';
import { Ticket, TicketSchema } from './schemas/ticket.schema';
import { TicketAccessService } from './ticket-access.service';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { TicketWorkflowService } from './ticket-workflow.service';

@Module({
  imports: [
    AuditModule,
    AuthModule,
    NotificationsModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: Ticket.name, schema: TicketSchema },
      { name: TicketComment.name, schema: TicketCommentSchema },
      { name: TicketCounter.name, schema: TicketCounterSchema },
    ]),
  ],
  controllers: [TicketsController],
  providers: [TicketsService, TicketAccessService, TicketWorkflowService],
  exports: [TicketsService, MongooseModule],
})
export class TicketsModule {}
