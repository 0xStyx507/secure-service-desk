import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

function toNumber(value: unknown): unknown {
  return typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
}

function toBoolean(value: unknown): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

export class ListNotificationsDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Transform(({ value }) => toNumber(value))
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Transform(({ value }) => toNumber(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ description: 'When true, return only unread notifications.' })
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  unread?: boolean;
}
