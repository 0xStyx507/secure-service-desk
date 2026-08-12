import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MinLength } from 'class-validator';

export class DisableMfaDto {
  @ApiProperty({ description: 'Current account password.' })
  @IsString()
  @MinLength(12)
  password!: string;

  @ApiProperty({ description: 'Current six-digit TOTP code.', example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}
