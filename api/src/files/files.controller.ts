import { Controller, Post, UploadedFile, UseInterceptors, BadRequestException, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { FirebaseService } from './firebase.service';
import { memoryStorage } from 'multer';

const imageFileInterceptor = (limitMb = 5) =>
    FileInterceptor('file', {
        storage: memoryStorage(),
        limits: { fileSize: limitMb * 1024 * 1024 },
        fileFilter: (req, file, cb) => {
            if (!file.originalname.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
                return cb(new BadRequestException('Solo imágenes permitidas (jpg, jpeg, png, gif, webp)'), false);
            }
            cb(null, true);
        },
    });

@Controller('files')
export class FilesController {
    constructor(private readonly firebaseService: FirebaseService) { }

    @Post('upload')
    @UseInterceptors(imageFileInterceptor())
    async uploadFile(@UploadedFile() file: Express.Multer.File) {
        if (!file) throw new BadRequestException('Falta el archivo');

        const url = await this.firebaseService.uploadFile(file, 'general');

        return {
            message: 'Imagen subida a Firebase con éxito',
            url,
        };
    }

    @UseGuards(AuthGuard('jwt'))
    @Post('upload/posts')
    @UseInterceptors(imageFileInterceptor())
    async uploadPostImage(@UploadedFile() file: Express.Multer.File) {
        if (!file) throw new BadRequestException('Falta el archivo');

        const url = await this.firebaseService.uploadFile(file, 'posts/images');

        return {
            message: 'Imagen de post subida con éxito',
            url,
        };
    }
}