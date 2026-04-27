import { IsString, IsNumber, IsOptional, IsBoolean } from 'class-validator';

export class CreateProviderServiceDto {
    @IsString()
    name: string; // Ej: "Cambio de Pastillas"

    @IsNumber()
    @IsOptional()
    vehicleTypeId?: number | null; // null = todos los vehículos

    @IsNumber()
    @IsOptional()
    priceMin: number;

    @IsNumber()
    @IsOptional()
    priceMax: number;

    @IsBoolean()
    @IsOptional()
    isActive?: boolean;
}