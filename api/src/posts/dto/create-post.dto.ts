import { IsString, IsOptional, IsBoolean, IsArray, IsNumber, IsEnum, IsInt } from 'class-validator';

export class CreatePostDto {
    // --- Autor (Opcional para pruebas) ---
    @IsInt()
    @IsOptional()
    authorId?: number;

    // --- Contenido Básico ---
    @IsString()
    @IsOptional()
    content?: string;

    @IsString()
    @IsOptional()
    mediaUrl?: string; // URL de imagen/video en Firebase

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