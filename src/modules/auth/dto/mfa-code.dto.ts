import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class MfaCodeDto {
  @ApiProperty({ description: 'Six-digit TOTP code.', example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}
