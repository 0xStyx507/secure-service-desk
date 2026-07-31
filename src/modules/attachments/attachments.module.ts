import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { TicketsModule } from '../tickets/tickets.module';
import { AttachmentFilePolicyService } from './attachment-file-policy.service';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { Attachment, AttachmentSchema } from './schemas/attachment.schema';

@Module({
  imports: [
    AuditModule,
    AuthModule,
    TicketsModule,
    MongooseModule.forFeature([
      { name: Attachment.name, schema: AttachmentSchema },
    ]),
  ],
  controllers: [AttachmentsController],
  providers: [AttachmentsService, AttachmentFilePolicyService],
  exports: [AttachmentsService, MongooseModule],
})
export class AttachmentsModule {}
