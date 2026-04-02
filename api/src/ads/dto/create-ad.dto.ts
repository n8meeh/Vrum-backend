import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export class CreateAdDto {
  @IsString()
  @MaxLength(100)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  targetUrl?: string;

  @IsEnum(['home_feed', 'map_pin', 'provider_list'])
  location: 'home_feed' | 'map_pin' | 'provider_list';

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ValidateIf((o) => o.startDate !== null && o.startDate !== undefined)
  @IsDateString()
  startDate?: string | null;

  @ValidateIf((o) => o.endDate !== null && o.endDate !== undefined)
  @IsDateString()
  endDate?: string | null;
}
