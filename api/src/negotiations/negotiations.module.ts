import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { NegotiationsService } from './negotiations.service';
import { NegotiationsController } from './negotiations.controller';
import { NegotiationsGateway } from './negotiations.gateway';
import { Negotiation } from './entities/negotiation.entity';
import { ChatRead } from './entities/chat-read.entity';
import { Order } from '../orders/entities/order.entity';
import { User } from '../users/entities/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Negotiation, ChatRead, Order, User]),
    forwardRef(() => NotificationsModule),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'CLAVE_SECRETA_SUPER_SEGURA',
    }),
  ],
  controllers: [NegotiationsController],
  providers: [NegotiationsService, NegotiationsGateway],
  exports: [NegotiationsService, NegotiationsGateway],
})
export class NegotiationsModule {}
