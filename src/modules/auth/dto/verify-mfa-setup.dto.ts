import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class VerifyMfaSetupDto {
  @ApiProperty({ description: 'Current account password.', writeOnly: true })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ description: 'Current six-digit TOTP code.', example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}
