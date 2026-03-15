import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('subscriptions')
export class Subscription {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'provider_id' })
  providerId: number;

  @Column({ type: 'enum', enum: ['trial', 'premium'] })
  plan: 'trial' | 'premium';

  @Column({ type: 'enum', enum: ['active', 'expired', 'cancelled'], default: 'active' })
  status: 'active' | 'expired' | 'cancelled';

  @Column({ name: 'start_date', type: 'datetime', nullable: true })
  startDate: Date | null;

  @Column({ name: 'end_date', type: 'datetime', nullable: true })
  endDate: Date | null;

  @Column({ name: 'payment_platform', type: 'varchar', length: 50, nullable: true })
  paymentPlatform: string | null;

  @Column({ name: 'external_reference', type: 'varchar', length: 255, nullable: true })
  externalReference: string | null;

  @Column({ name: 'device_id', type: 'varchar', length: 255, nullable: true })
  deviceId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
