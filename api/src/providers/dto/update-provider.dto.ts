import { PartialType } from '@nestjs/mapped-types';
import { CreateProviderDto } from './create-provider.dto';
import { IsBoolean, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

// Clase anidada para validar contactos
export class ContactsDto {
    @IsOptional() @IsString() whatsapp?: string;
    @IsOptional() @IsString() instagram?: string;
    @IsOptional() @IsString() facebook?: string;
    @IsOptional() @IsString() tiktok?: string;
    @IsOptional() @IsString() website?: string;
    @IsOptional() @IsString() phone?: string;
}

export class UpdateProviderDto extends PartialType(CreateProviderDto) {
    // 🟢 EXCLUSIVO DE EDICIÓN

    // Para activar/desactivar el taller manualmente (Modo Vacaciones)
    @IsOptional()
    @IsBoolean()
    isVisible?: boolean;

    // Servicio a domicilio
    @IsOptional()
    @IsBoolean()
    isHomeService?: boolean;

    // Imágenes del negocio
    @IsOptional()
    @IsString()
    logoUrl?: string;

    @IsOptional()
    @IsString()
    coverUrl?: string;

    // Contactos validados
    @IsOptional()
    @ValidateNested()
    @Type(() => ContactsDto)
    contacts?: ContactsDto;
}