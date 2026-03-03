import { Module } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CommentsController } from './comments.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Comment } from './entities/comment.entity';
// 👇 IMPORTAR LAS ENTIDADES FALTANTES
import { Provider } from '../providers/entities/provider.entity';
import { Post } from '../posts/entities/post.entity';
import { User } from '../users/entities/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    NotificationsModule,
    TypeOrmModule.forFeature([
      Comment,  // Tu entidad principal
      Provider, // 👈 NECESARIA PARA LA VALIDACIÓN FREEMIUM
      Post,     // Seguramente la usas para validar si el post existe
      User      // Seguramente la usas para validar el autor
    ])
  ],
  controllers: [CommentsController],
  providers: [CommentsService],
  exports: [CommentsService]
})
export class CommentsModule { }