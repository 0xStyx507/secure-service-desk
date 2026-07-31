import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

function toNumber(value: unknown): unknown {
  return typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
}

export class ListAttachmentsDto {
  @ApiPropertyOptional({ default: 1, maximum: 10_000 })
  @Transform(({ value }) => toNumber(value))
  @IsInt()
  @Min(1)
  @Max(10_000)
  page = 1;

  @ApiPropertyOptional({ default: 50, maximum: 100 })
  @Transform(({ value }) => toNumber(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}
