import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('native_ads')
export class NativeAd {
  @PrimaryGeneratedColumn()
  id: number;

  // La tabla en BD usa 'client_name'. Mapeado como 'title' para compatibilidad con el frontend.
  @Column({ name: 'client_name', length: 100, nullable: true })
  title: string;

  @Column({ name: 'image_url', length: 255, nullable: true })
  imageUrl: string;

  @Column({ name: 'target_url', length: 255, nullable: true })
  targetUrl: string;

  @Column({
    type: 'set',
    enum: ['home_feed', 'group_list', 'provider_list'],
    default: ['home_feed'],
  })
  location: string[];

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'views_count', default: 0 })
  viewsCount: number;

  @Column({ name: 'clicks_count', default: 0 })
  clicksCount: number;

  @Column({ name: 'start_date', type: 'datetime', nullable: true })
  startDate: Date | null;

  @Column({ name: 'end_date', type: 'datetime', nullable: true })
  endDate: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
