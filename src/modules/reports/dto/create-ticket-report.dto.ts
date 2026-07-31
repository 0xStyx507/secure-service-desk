import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { TicketPriority } from '../../tickets/ticket-priority.enum';
import { TicketStatus } from '../../tickets/ticket-status.enum';

export class CreateTicketReportDto {
  @ApiPropertyOptional({ enum: TicketStatus })
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @ApiPropertyOptional({ enum: TicketPriority })
  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @ApiPropertyOptional({ default: 500, minimum: 1, maximum: 2_000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2_000)
  maxRows = 500;
}
