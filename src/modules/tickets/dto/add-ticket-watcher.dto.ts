import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

export class AddTicketWatcherDto {
  @ApiProperty({ description: 'Active user to add as a ticket watcher.' })
  @IsMongoId()
  userId!: string;
}
