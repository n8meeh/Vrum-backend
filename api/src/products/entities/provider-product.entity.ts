import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';
import { Provider } from '../../providers/entities/provider.entity';
import { VehicleType } from '../../vehicles/entities/vehicle-type.entity';
import { ProductCategory } from './product-category.entity';

@Entity('provider_products')
export class ProviderProduct {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'provider_id' })
    providerId: number;

    @Column({ length: 255 })
    name: string;

    @Column({ type: 'text', nullable: true })
    description: string | null;

    @Column({ name: 'category_id', nullable: true })
    categoryId: number | null;

    @Column({ name: 'vehicle_type_id', nullable: true })
    vehicleTypeId: number | null;

    @Column({ length: 100, nullable: true })
    brand: string | null;

    @Column({ name: 'part_number', length: 100, nullable: true })
    partNumber: string | null;

    @Column({
        name: 'condition',
        type: 'enum',
        enum: ['new', 'used', 'refurbished'],
        default: 'new',
    })
    condition: 'new' | 'used' | 'refurbished';

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    price: number;

    @Column({ type: 'int', default: 0 })
    stock: number;

    @Column({ name: 'image_url', nullable: true })
    imageUrl: string | null;

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    @Column({ name: 'is_visible', default: true })
    isVisible: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;

    // ── Relaciones ──
    @ManyToOne(() => Provider, (provider) => provider.products)
    @JoinColumn({ name: 'provider_id' })
    provider: Provider;

    @ManyToOne(() => ProductCategory, (cat) => cat.products, { nullable: true })
    @JoinColumn({ name: 'category_id' })
    category: ProductCategory | null;

    @ManyToOne(() => VehicleType, { nullable: true })
    @JoinColumn({ name: 'vehicle_type_id' })
    vehicleType: VehicleType | null;
}
