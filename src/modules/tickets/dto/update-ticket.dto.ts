import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { TicketPriority } from '../ticket-priority.enum';
import { TicketStatus } from '../ticket-status.enum';

export class UpdateTicketDto {
  @ApiProperty({
    description: 'Current ticket version used for optimistic concurrency control.',
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  version!: number;

  @ApiPropertyOptional({ enum: TicketStatus })
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @ApiPropertyOptional({ enum: TicketPriority })
  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @ApiPropertyOptional({
    description: 'MongoDB user ID. Send null to remove the assignee.',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsMongoId()
  assigneeId?: string | null;

  @ApiPropertyOptional({
    description: 'Required when resolving a ticket.',
    minLength: 5,
    maxLength: 5_000,
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(5, 5_000)
  resolution?: string;
}
