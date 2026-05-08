import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, DeleteDateColumn } from 'typeorm';
import { Provider } from './provider.entity';
// Asegúrate de que esta ruta apunte a donde tienes VehicleType
import { VehicleType } from '../../vehicles/entities/vehicle-type.entity';

@Entity('provider_services')
export class ProviderService {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'provider_id' })
    providerId: number;

    @Column()
    name: string;

    @Column({ name: 'vehicle_type_id', nullable: true })
    vehicleTypeId: number | null;

    @Column({ name: 'price_min', type: 'decimal', precision: 10, scale: 2, nullable: true })
    priceMin: number;

    @Column({ name: 'price_max', type: 'decimal', precision: 10, scale: 2, nullable: true })
    priceMax: number;

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @DeleteDateColumn({ name: 'deleted_at', nullable: true })
    deletedAt: Date | null;

    @ManyToOne(() => Provider, (provider) => provider.services)
    @JoinColumn({ name: 'provider_id' })
    provider: Provider;

    @ManyToOne(() => VehicleType, { nullable: true })
    @JoinColumn({ name: 'vehicle_type_id' })
    vehicleType: VehicleType | null;
}