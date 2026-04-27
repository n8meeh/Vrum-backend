import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PostsService } from './posts.service';
import { PostsController } from './posts.controller';
import { Post } from './entities/post.entity';
import { PostLike } from './entities/post-like.entity';
import { PollVote } from './entities/poll-vote.entity';
import { CommentsService } from '../comments/comments.service';
// 👇 1. IMPORTA LA ENTIDAD TAG
import { Tag } from './entities/tag.entity';
import { CommentsModule } from '../comments/comments.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UserFollow } from '../users/entities/user-follow.entity'; // 👈 IMPORTAR
import { UserBlock } from '../users/entities/user-block.entity';
import { Provider } from '../providers/entities/provider.entity';
import { User } from '../users/entities/user.entity';
import { GroupMember } from '../groups/entities/group-member.entity';
@Module({
  imports: [
    CommentsModule,
    NotificationsModule,
    // 👇 2. AGREGALA AQUÍ DENTRO DE LOS CORCHETES
    TypeOrmModule.forFeature([
      Post,
      PostLike,
      PollVote,
      Tag,
      CommentsService,
      UserFollow,
      UserBlock,
      Provider,
      User,
      GroupMember,
    ])
  ],
  controllers: [PostsController],
  providers: [PostsService],
  exports: [PostsService]
})
export class PostsModule { }