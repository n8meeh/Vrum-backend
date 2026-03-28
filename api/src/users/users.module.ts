import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GroupsModule } from '../groups/groups.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { Post } from '../posts/entities/post.entity';
import { Provider } from '../providers/entities/provider.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { UserBlock } from './entities/user-block.entity';
import { UserFollow } from './entities/user-follow.entity';
import { User } from './entities/user.entity';
import { UsersController } from './users.controller';
import { UsersScheduler } from './users.scheduler';
import { UsersService } from './users.service';

@Module({
  imports: [
    NotificationsModule,
    GroupsModule,
    TypeOrmModule.forFeature([
      User,
      UserBlock,
      UserFollow,
      Vehicle,
      Post,
      Provider,
    ]),
  ],
  controllers: [UsersController],
  providers: [UsersService, UsersScheduler],
  exports: [UsersService],
})
export class UsersModule {}
