import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsService } from './notifications.service';
import { NotificationTriggerService } from './notification-trigger.service';
import { NotificationsController } from './notifications.controller';
import { Notification } from './entities/notification.entity';
import { User } from '../users/entities/user.entity';
import { NegotiationsModule } from '../negotiations/negotiations.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, User]),
    forwardRef(() => NegotiationsModule),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationTriggerService],
  exports: [NotificationsService, NotificationTriggerService],
})
export class NotificationsModule { }
