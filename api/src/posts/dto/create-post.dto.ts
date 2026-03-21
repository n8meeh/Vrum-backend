import { IsString, IsOptional, IsBoolean, IsArray, IsNumber, IsEnum, IsInt, ArrayMaxSize } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreatePostDto {
    // --- Autor (Opcional para pruebas) ---
    @IsInt()
    @IsOptional()
    authorId?: number;

    // --- Contenido Básico ---
    @IsString()
    @IsOptional()
    content?: string;

    @IsArray()
    @IsString({ each: true })
    @ArrayMaxSize(5)
    @IsOptional()
    @Transform(({ value }) => {
        if (typeof value === 'string') return value ? [value] : [];
        return value;
    })
    mediaUrl?: string[]; // Array de URLs de imágenes en Firebase (máx 5)

    @IsInt()
    @IsOptional()
    vehicleId?: number;

    @IsInt()
    @IsOptional()
    providerId?: number;

    // --- Ubicación (Vital para el Feed) ---
    @IsNumber()
    @IsOptional()
    lat?: number;

    @IsNumber()
    @IsOptional()
    lng?: number;

    // --- Configuración y Privacidad ---
    @IsEnum(['public', 'users_only', 'mechanics_only', 'tow_only'])
    @IsOptional()
    visibility?: string;

    // --- Encuestas (Lo nuevo) ---
    @IsBoolean()
    @IsOptional()
    isPoll?: boolean;

    @IsArray()
    @IsOptional()
    pollOptions?: string[]; // Ejemplo: ["Opción A", "Opción B"]

    // --- Identidad Dual ---
    @IsBoolean()
    @IsOptional()
    isProfessional?: boolean;

    // --- Grupos ---
    @IsInt()
    @IsOptional()
    groupId?: number;
}