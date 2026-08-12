import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class MfaLoginDto {
  @ApiProperty({ description: 'Opaque one-time challenge returned by /auth/login.' })
  @IsString()
  @Length(32, 128)
  challengeToken!: string;

  @ApiProperty({ description: 'Six-digit TOTP code.', example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}
