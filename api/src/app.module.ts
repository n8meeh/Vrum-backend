import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ProvidersModule } from './providers/providers.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { OrdersModule } from './orders/orders.module';
import { NegotiationsModule } from './negotiations/negotiations.module';
import { FilesModule } from './files/files.module';
import { PostsModule } from './posts/posts.module';
import { CommentsModule } from './comments/comments.module';
import { ReviewsModule } from './reviews/reviews.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReportsModule } from './reports/reports.module';
import { CategoriesModule } from './categories/categories.module';
import { AdsModule } from './ads/ads.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { StaffModule } from './staff/staff.module';
import { VehicleEventsModule } from './vehicle-events/vehicle-events.module';
import { AdminModule } from './admin/admin.module';
import { PaymentsModule } from './payments/payments.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      username: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'root',
      database: process.env.DB_NAME || 'vrum_db',
      autoLoadEntities: true,
      synchronize: false,
      timezone: 'Z', // Forzar UTC para evitar desfases de timezone
    }),
    ScheduleModule.forRoot(),
    UsersModule,
    AuthModule,
    ProvidersModule,
    VehiclesModule,
    OrdersModule,
    NegotiationsModule,
    FilesModule,
    PostsModule,
    CommentsModule,
    ReviewsModule,
    NotificationsModule,
    ReportsModule,
    CategoriesModule,
    AdsModule,
    SubscriptionsModule,
    StaffModule,
    VehicleEventsModule,
    AdminModule,
    PaymentsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
