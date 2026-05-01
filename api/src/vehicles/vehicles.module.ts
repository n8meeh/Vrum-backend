import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VehiclesService } from './vehicles.service';
import { VehiclesController } from './vehicles.controller';
import { Vehicle } from './entities/vehicle.entity';
import { VehicleType } from './entities/vehicle-type.entity';
import { VehicleMileageLog } from './entities/vehicle-mileage-log.entity';
import { Order } from '../orders/entities/order.entity';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Vehicle, VehicleType, VehicleMileageLog, Order]),
    FilesModule,
  ],
  controllers: [VehiclesController],
  providers: [VehiclesService],
  exports: [VehiclesService]
})
export class VehiclesModule { }
