import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GroupMember } from '../groups/entities/group-member.entity';
import { NegotiationsModule } from '../negotiations/negotiations.module';
import { Post } from '../posts/entities/post.entity';
import { User } from '../users/entities/user.entity';
import { Notification } from './entities/notification.entity';
import { NotificationTriggerService } from './notification-trigger.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, User, GroupMember, Post]),
    forwardRef(() => NegotiationsModule),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationTriggerService],
  exports: [NotificationsService, NotificationTriggerService],
})
export class NotificationsModule {}
