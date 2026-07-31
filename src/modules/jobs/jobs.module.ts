import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DeadLetterService } from './dead-letter.service';
import { JobFailure, JobFailureSchema } from './schemas/job-failure.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: JobFailure.name, schema: JobFailureSchema },
    ]),
  ],
  providers: [DeadLetterService],
  exports: [DeadLetterService, MongooseModule],
})
export class JobsModule {}
