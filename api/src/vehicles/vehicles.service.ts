import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Vehicle } from './entities/vehicle.entity';
import { VehicleType } from './entities/vehicle-type.entity';
import { VehicleMileageLog } from './entities/vehicle-mileage-log.entity';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { Order } from '../orders/entities/order.entity';
import { FirebaseService } from '../files/firebase.service';

@Injectable()
export class VehiclesService {
  constructor(
    @InjectRepository(Vehicle) private vehiclesRepository: Repository<Vehicle>,
    @InjectRepository(VehicleType) private vehicleTypesRepo: Repository<VehicleType>,
    @InjectRepository(VehicleMileageLog) private mileageLogRepo: Repository<VehicleMileageLog>,
    @InjectRepository(Order) private ordersRepository: Repository<Order>,
    private readonly firebaseService: FirebaseService,
  ) { }

  private readonly MAX_VEHICLES_PER_USER = 5;

  async create(userId: number, createVehicleDto: CreateVehicleDto) {
    const currentCount = await this.vehiclesRepository.count({
      where: { userId, deletedAt: IsNull() },
    });
    if (currentCount >= this.MAX_VEHICLES_PER_USER) {
      throw new BadRequestException(
        `Has alcanzado el límite máximo de ${this.MAX_VEHICLES_PER_USER} vehículos en tu garaje.`,
      );
    }

    const newVehicle = this.vehiclesRepository.create({
      userId: userId,
      vehicleTypeId: createVehicleDto.vehicleTypeId,
      brand: createVehicleDto.brand,
      model: createVehicleDto.model,
      year: createVehicleDto.year,
      vin: createVehicleDto.vin,
      plate: createVehicleDto.plate,
      alias: createVehicleDto.alias,
      lastMileage: createVehicleDto.lastMileage || 0,
      photoUrl: createVehicleDto.photoUrl,
      fuelType: createVehicleDto.fuelType,
      transmission: createVehicleDto.transmission,
      engineSize: createVehicleDto.engineSize,
    });
    return await this.vehiclesRepository.save(newVehicle);
  }

  async findAllByUser(userId: number) {
    return this.vehiclesRepository.find({
      where: {
        userId: userId,
        deletedAt: IsNull()
      },
      relations: ['vehicleType'],
      order: { id: 'DESC' }
    });
  }

  async findAllTypes() {
    return await this.vehicleTypesRepo.find({
      order: { name: 'ASC' }
    });
  }

  async updateMileage(id: number, userId: number, mileage: number) {
    const vehicle = await this.vehiclesRepository.findOne({ where: { id } });

    if (!vehicle) throw new NotFoundException('Vehículo no encontrado');
    if (vehicle.userId !== userId) throw new ForbiddenException('No tienes permiso para editar este vehículo');

    if (mileage < vehicle.lastMileage) {
      throw new BadRequestException('El nuevo kilometraje no puede ser menor al actual');
    }

    vehicle.lastMileage = mileage;
    return await this.vehiclesRepository.save(vehicle);
  }

  findAll() { return `This action returns all vehicles`; }
  findOne(id: number) { return `This action returns a #${id} vehicle`; }

  async getMileageLogs(vehicleId: number, userId: number) {
    const vehicle = await this.vehiclesRepository.findOne({ where: { id: vehicleId, userId } });
    if (!vehicle) throw new NotFoundException('Vehículo no encontrado o no te pertenece');

    return this.mileageLogRepo.find({
      where: { vehicleId },
      order: { createdAt: 'DESC' },
    });
  }

  async update(id: number, userId: number, dto: UpdateVehicleDto) {
    const vehicle = await this.vehiclesRepository.findOne({ where: { id, userId } });

    if (!vehicle) throw new NotFoundException('Vehículo no encontrado o no te pertenece');

    // Cascade-delete: if the photo is being replaced, remove the old file from Storage.
    if (dto.photoUrl && dto.photoUrl !== vehicle.photoUrl && vehicle.photoUrl) {
      void this.firebaseService.deleteFileByUrl(vehicle.photoUrl);
    }

    Object.assign(vehicle, dto);
    return await this.vehiclesRepository.save(vehicle);
  }

  async remove(id: number, userId: number) {
    const vehicle = await this.vehiclesRepository.findOne({ where: { id, userId } });

    if (!vehicle) throw new NotFoundException('Vehículo no encontrado o no te pertenece');

    // Cascade-delete: remove the photo from Storage before soft-deleting.
    // Without this the cleanup script would treat the file as "referenced" forever
    // because the soft-deleted row still holds the URL.
    if (vehicle.photoUrl) {
      void this.firebaseService.deleteFileByUrl(vehicle.photoUrl);
    }

    await this.vehiclesRepository.softDelete(vehicle.id);

    return { message: 'Vehículo eliminado del garaje' };
  }

  async getTimeline(vehicleId: number, userId: number) {
    const vehicle = await this.vehiclesRepository.findOne({ where: { id: vehicleId, userId } });
    if (!vehicle) throw new NotFoundException('Vehículo no encontrado o no te pertenece');

    const [orders, mileageLogs] = await Promise.all([
      this.ordersRepository.find({
        where: { vehicleId, status: 'completed' },
        relations: ['provider'],
        order: { completedAt: 'DESC' },
      }),
      this.mileageLogRepo.find({
        where: { vehicleId },
        order: { createdAt: 'DESC' },
      }),
    ]);

    const orderItems = orders.map(order => ({
      type: 'order' as const,
      date: (order.completedAt || order.createdAt).toISOString(),
      orderId: order.id,
      title: order.title || 'Servicio completado',
      finalPrice: order.finalPrice ? Number(order.finalPrice) : null,
      businessName: order.provider?.businessName || null,
    }));

    const mileageItems = mileageLogs.map(log => ({
      type: 'mileage' as const,
      date: log.createdAt.toISOString(),
      logId: log.id,
      mileage: log.mileage,
      source: log.source,
    }));

    const timeline = [...orderItems, ...mileageItems].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    const totalSpent = orderItems.reduce((sum, item) => sum + (item.finalPrice ?? 0), 0);

    return { timeline, totalSpent };
  }
}
