import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class CreateTicketDto {
  @ApiProperty({ example: 'Cannot access the customer portal', maxLength: 160 })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(3, 160)
  subject!: string;

  @ApiProperty({
    example: 'The portal returns an unauthorized response after signing in.',
    maxLength: 10_000,
  })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(10, 10_000)
  description!: string;
}
