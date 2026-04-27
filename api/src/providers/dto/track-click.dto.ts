import { IsIn, IsString } from 'class-validator';

export class TrackClickDto {
    @IsString()
    @IsIn(['whatsapp', 'call', 'route', 'instagram', 'facebook', 'tiktok', 'website'])
    type: string;
}
