import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateReportDto {
    @IsNumber()
    @IsOptional()
    reportedUserId?: number; // A quién reportamos (se calcula automáticamente según contentType)

    @IsEnum(['post', 'comment', 'provider', 'user', 'group'])
    contentType: string;

    @IsNumber()
    contentId: number; // ID del post/comentario/provider/user

    @IsEnum(['spam', 'hate_speech', 'scam', 'other'])
    reason: string;

    @IsString()
    @IsOptional()
    description?: string;
}