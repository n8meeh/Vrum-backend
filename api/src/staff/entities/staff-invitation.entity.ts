import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Provider } from '../../providers/entities/provider.entity';
import { User } from '../../users/entities/user.entity';

@Entity('staff_invitations')
export class StaffInvitation {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'provider_id' })
    providerId: number;

    @ManyToOne(() => Provider, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'provider_id' })
    provider: Provider;

    @Column({ name: 'invited_by' })
    invitedBy: number;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'invited_by' })
    inviter: User;

    @Column()
    email: string;

    @Column({ type: 'enum', enum: ['provider_admin', 'provider_staff'] })
    role: 'provider_admin' | 'provider_staff';

    @Column({ unique: true })
    token: string;

    @Column({ type: 'enum', enum: ['pending', 'accepted', 'expired', 'cancelled', 'rejected'], default: 'pending' })
    status: 'pending' | 'accepted' | 'expired' | 'cancelled' | 'rejected';

    @Column({ name: 'expires_at', type: 'datetime' })
    expiresAt: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
