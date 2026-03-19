import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn, OneToMany, ManyToMany, JoinTable, DeleteDateColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ProviderService } from './provider-service.entity';
import { ProviderProduct } from '../../products/entities/provider-product.entity';
import { VehicleType } from '../../vehicles/entities/vehicle-type.entity';
import { Specialty } from './specialty.entity';
import { Review } from '../../reviews/entities/review.entity';
import { Exclude } from 'class-transformer';

@Entity('providers')
export class Provider {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'user_id' })
    userId: number;

    @Column({ name: 'specialty_brands', type: 'json', nullable: true })
    specialtyBrands: string[];

    @ManyToMany(() => VehicleType)
    @JoinTable({
        name: 'provider_vehicle_types', // Nombre de la tabla nueva
        joinColumn: { name: 'provider_id', referencedColumnName: 'id' },
        inverseJoinColumn: { name: 'vehicle_type_id', referencedColumnName: 'id' }
    })
    vehicleTypes: VehicleType[];

    // Relación: Un proveedor puede tener múltiples especialidades jerárquicas
    @ManyToMany(() => Specialty, (specialty) => specialty.providers)
    @JoinTable({
        name: 'provider_specialties',
        joinColumn: { name: 'provider_id', referencedColumnName: 'id' },
        inverseJoinColumn: { name: 'specialty_id', referencedColumnName: 'id' }
    })
    specialties: Specialty[];

    @OneToMany(() => ProviderService, (service) => service.provider)
    services: ProviderService[];

    @OneToMany(() => ProviderProduct, (product) => product.provider)
    products: ProviderProduct[];

    // Relación 1 a 1: Un Proveedor ES Un Usuario
    @OneToOne(() => User)
    @JoinColumn({ name: 'user_id' })
    user: User;

    // Relación 1 a N: Un Proveedor tiene muchas reseñas
    @OneToMany(() => Review, (review) => review.provider)
    reviews: Review[];

    // Staff: Miembros de equipo vinculados a este negocio
    @OneToMany(() => User, (user) => user.staffProvider)
    staffMembers: User[];

    @Column({ name: 'business_name' })
    businessName: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    // Columna legacy — no se usa en lógica, pero la BD la requiere NOT NULL
    @Column({ default: 'other' })
    category: string;

    @Column({ name: 'is_home_service', default: false })
    isHomeService: boolean;

    // Imágenes del negocio
    @Column({ name: 'logo_url', nullable: true })
    logoUrl: string;

    @Column({ name: 'cover_url', nullable: true })
    coverUrl: string;

    // Contactos es un JSON en la BD
    @Column({ type: 'json', nullable: true })
    contacts: {
        whatsapp?: string;
        instagram?: string;
        facebook?: string;
        tiktok?: string;
        website?: string;
        phone?: string;
    };

    @Column({ name: 'opening_hours', nullable: true })
    openingHours: string;

    @Column({ name: 'is_multibrand', default: false })
    isMultibrand: boolean;

    @Column({ name: 'is_visible', default: true })
    isVisible: boolean;

    // Ubicación
    @Column({ type: 'decimal', precision: 10, scale: 8, nullable: true })
    lat: number;

    @Column({ type: 'decimal', precision: 11, scale: 8, nullable: true })
    lng: number;

    @Column({ nullable: true })
    address: string;

    @Column({ name: 'rating_avg', type: 'decimal', precision: 3, scale: 2, default: 0 })
    ratingAvg: number;

    @Column({ name: 'is_premium', default: false })
    isPremium: boolean;

    // 0 = Nuevo, 1 = Verificado, 2 = En Investigación, 3 = Baneado
    @Column({
        name: 'is_verified',
        type: 'smallint',
        default: 0,
        transformer: {
            to: (value: number) => value,
            from: (value: any) => Number(value),
        },
    })
    isVerified: number;

    // ... otras columnas

    // 👇 ¿TIENES ESTO ASÍ?
    @DeleteDateColumn({ name: 'deleted_at' })
    @Exclude() // 🔒 OCULTO - Información técnica
    deletedAt: Date | null;

    // ... relaciones

}