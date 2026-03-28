import { Transform } from 'class-transformer';
import {
    IsBoolean,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
} from 'class-validator';

export class UpdateGroupDto {
  @IsString()
  @IsOptional()
  @MinLength(3)
  @MaxLength(50)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  description?: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => value ?? null)
  imageUrl?: string | null;

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;
}
