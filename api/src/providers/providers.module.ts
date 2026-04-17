import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProvidersService } from './providers.service';
import { ProvidersController } from './providers.controller';
import { Provider } from './entities/provider.entity';
import { User } from '../users/entities/user.entity';
import { ProviderService } from './entities/provider-service.entity';
import { VehicleType } from '../vehicles/entities/vehicle-type.entity';
import { Category } from './entities/category.entity';
import { Specialty } from './entities/specialty.entity';
import { ProviderMetric } from './entities/provider-metric.entity';
import { Review } from '../reviews/entities/review.entity';
import { Order } from '../orders/entities/order.entity';
import { Negotiation } from '../negotiations/entities/negotiation.entity';
import { MetricsService } from './metrics.service';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { UserFavoriteProvider } from '../favorites/entities/favorite.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Provider,
      ProviderService,
      User,
      VehicleType,
      Category,
      Specialty,
      ProviderMetric,
      Review,
      Order,
      Negotiation,
      UserFavoriteProvider,
    ]),
    UsersModule,
    AuthModule,
  ],
  controllers: [ProvidersController],
  providers: [ProvidersService, MetricsService],
  exports: [ProvidersService, MetricsService],
})
export class ProvidersModule { }