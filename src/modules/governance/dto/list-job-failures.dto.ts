import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, Min, Max } from 'class-validator';

function toNumber(value: unknown): unknown {
  return typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
}

export class ListJobFailuresDto {
  @ApiPropertyOptional({ default: 1 })
  @Transform(({ value }) => toNumber(value))
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 50, maximum: 100 })
  @Transform(({ value }) => toNumber(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}
