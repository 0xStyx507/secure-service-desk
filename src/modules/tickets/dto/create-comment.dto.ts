import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { CommentVisibility } from '../comment-visibility.enum';

export class CreateCommentDto {
  @ApiProperty({ maxLength: 10_000 })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(1, 10_000)
  body!: string;

  @ApiPropertyOptional({
    enum: CommentVisibility,
    default: CommentVisibility.PUBLIC,
    description: 'INTERNAL comments require SUPPORT or ADMIN.',
  })
  @IsOptional()
  @IsEnum(CommentVisibility)
  visibility?: CommentVisibility;
}
