import { PartialType } from '@nestjs/mapped-types';
import { CreateOrderDto } from './create-order.dto';
// 👇 1. Importa los validadores
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateOrderDto extends PartialType(CreateOrderDto) {
    
    // 👇 2. Agrega los decoradores para que NestJS acepte el campo
    @IsOptional()
    @IsString()
    @IsEnum(['pending', 'accepted', 'in_progress', 'completed', 'cancelled'])
    status?: string;

    @IsOptional()
    @IsNumber()
    finalPrice?: number;

    @IsOptional()
    @IsNumber()
    currentMileage?: number;
}