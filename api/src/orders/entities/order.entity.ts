import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, OneToOne } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Provider } from '../../providers/entities/provider.entity';
import { Vehicle } from '../../vehicles/entities/vehicle.entity';
import { Post } from '../../posts/entities/post.entity';
import { Review } from '../../reviews/entities/review.entity';
import { ProviderProduct } from '../../products/entities/provider-product.entity';

@Entity('orders')
export class Order {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'client_id' })
    clientId: number;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'client_id' })
    client: User;

    @Column({ name: 'provider_id' })
    providerId: number;

    @ManyToOne(() => Provider)
    @JoinColumn({ name: 'provider_id' })
    provider: Provider;

    @Column({ name: 'vehicle_id', nullable: true })
    vehicleId: number;

    @ManyToOne(() => Vehicle, { nullable: true })
    @JoinColumn({ name: 'vehicle_id' })
    vehicle: Vehicle;

    @Column({ name: 'post_id', nullable: true })
    postId: number;

    @ManyToOne(() => Post, { nullable: true })
    @JoinColumn({ name: 'post_id' })
    post: Post;

    @Column({ default: 'pending' })
    status: string;

    // 👇👇👇 ESTOS SON LOS QUE TE FALTABAN PARA EL ERROR ROJO 👇👇👇
    @Column({ nullable: true })
    title: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ name: 'is_home_service', default: false })
    isHomeService: boolean;

    @Column({ name: 'scheduled_date', type: 'datetime', nullable: true })
    scheduledDate: Date;

    @Column({ name: 'final_price', type: 'decimal', precision: 10, scale: 2, nullable: true })
    finalPrice: number;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @Column({ name: 'completed_at', type: 'datetime', nullable: true })
    completedAt: Date;

    // 👇 CAMBIA ESTO: Agrega { name: 'is_proposal' }
    @Column({ name: 'is_proposal', default: false })
    isProposal: boolean;

    @Column({ name: 'product_id', nullable: true })
    productId: number | null;

    @ManyToOne(() => ProviderProduct, { nullable: true })
    @JoinColumn({ name: 'product_id' })
    product: ProviderProduct | null;

    @OneToOne(() => Review, (review) => review.order)
    review: Review;
}