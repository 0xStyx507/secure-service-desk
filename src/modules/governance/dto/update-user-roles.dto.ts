import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, ArrayUnique, IsArray, IsEnum } from 'class-validator';
import { Role } from '../../auth/roles.enum';

export class UpdateUserRolesDto {
  @ApiProperty({ enum: Role, isArray: true, minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsEnum(Role, { each: true })
  roles!: Role[];
}
