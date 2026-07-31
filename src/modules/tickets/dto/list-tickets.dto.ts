import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { TicketPriority } from '../ticket-priority.enum';
import { TicketStatus } from '../ticket-status.enum';

function toNumber(value: unknown): unknown {
  return typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
}

export class ListTicketsDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Transform(({ value }) => toNumber(value))
  @IsInt()
  @Min(1)
  @Max(10_000)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Transform(({ value }) => toNumber(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  search?: string;

  @ApiPropertyOptional({ enum: TicketStatus })
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @ApiPropertyOptional({ enum: TicketPriority })
  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  assigneeId?: string;
}
