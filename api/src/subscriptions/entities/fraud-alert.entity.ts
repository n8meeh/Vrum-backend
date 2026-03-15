import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('fraud_alerts')
export class FraudAlert {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'provider_id' })
  providerId: number;

  @Column({ name: 'similar_provider_id' })
  similarProviderId: number;

  @Column({ name: 'provider_name', type: 'varchar', length: 255 })
  providerName: string;

  @Column({ name: 'similar_provider_name', type: 'varchar', length: 255 })
  similarProviderName: string;

  @Column({ name: 'distance_meters', type: 'decimal', precision: 10, scale: 2 })
  distanceMeters: number;

  @Column({ name: 'name_similarity', type: 'decimal', precision: 5, scale: 2 })
  nameSimilarity: number;

  @Column({ type: 'enum', enum: ['pending', 'dismissed', 'confirmed'], default: 'pending' })
  status: 'pending' | 'dismissed' | 'confirmed';

  @Column({ name: 'reviewed_by', nullable: true })
  reviewedBy: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
