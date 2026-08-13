import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DeadLetterService } from './dead-letter.service';
import { JobFailure, JobFailureSchema } from './schemas/job-failure.schema';
import { OutboxEvent, OutboxEventSchema } from './schemas/outbox-event.schema';
import { OutboxService } from './outbox.service';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: JobFailure.name, schema: JobFailureSchema },
      { name: OutboxEvent.name, schema: OutboxEventSchema },
    ]),
  ],
  providers: [DeadLetterService, OutboxService],
  exports: [DeadLetterService, OutboxService, MongooseModule],
})
export class JobsModule {}
