import { IsNumber, IsOptional, IsString, IsBoolean, IsDateString } from 'class-validator';

export class CreateOrderDto {
    @IsNumber()
    providerId: number; // A qué taller le pido la hora

    @IsNumber()
    @IsOptional()
    vehicleId?: number;  // Qué auto voy a llevar (opcional para productos)

    @IsString()
    @IsOptional()
    title?: string;     // Ej: "Cambio de Aceite"

    @IsString()
    @IsOptional()
    description?: string; // Ej: "Quiero agendar para el martes..."

    @IsBoolean()
    @IsOptional()
    isHomeService?: boolean; // Si el servicio es a domicilio

    @IsDateString()
    @IsOptional()
    scheduledDate?: string; // Fecha agendada en formato ISO8601
}