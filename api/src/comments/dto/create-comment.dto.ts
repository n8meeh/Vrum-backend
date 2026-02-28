import { IsInt, IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class CreateCommentDto {
    @IsInt()
    @IsNotEmpty()
    postId: number;

    @IsString()
    @IsNotEmpty()
    content: string;

    @IsInt()
    @IsOptional()
    authorId?: number; // Opcional para pruebas; si no viene, se usa el userId del JWT

    @IsBoolean()
    @IsOptional()
    isProfessional?: boolean;
}