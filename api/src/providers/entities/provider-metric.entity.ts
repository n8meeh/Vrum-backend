import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { Provider } from './provider.entity';

@Entity('provider_metrics')
@Unique(['providerId', 'date'])
export class ProviderMetric {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'provider_id' })
    providerId: number;

    @ManyToOne(() => Provider, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'provider_id' })
    provider: Provider;

    @Column({ type: 'date' })
    date: string; // YYYY-MM-DD

    @Column({ name: 'profile_views', default: 0 })
    profileViews: number;

    @Column({ name: 'clicks_whatsapp', default: 0 })
    clicksWhatsapp: number;

    @Column({ name: 'clicks_call', default: 0 })
    clicksCall: number;

    @Column({ name: 'clicks_route', default: 0 })
    clicksRoute: number;

    @Column({ name: 'clicks_instagram', default: 0 })
    clicksInstagram: number;

    @Column({ name: 'clicks_facebook', default: 0 })
    clicksFacebook: number;

    @Column({ name: 'clicks_tiktok', default: 0 })
    clicksTiktok: number;

    @Column({ name: 'clicks_website', default: 0 })
    clicksWebsite: number;
}
