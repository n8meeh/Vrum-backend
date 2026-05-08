import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('content_reports')
export class ContentReport {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'reporter_id' })
    reporterId: number;

    @Column({ name: 'reported_user_id' })
    reportedUserId: number;

    @Column({ name: 'content_type', type: 'enum', enum: ['post', 'comment', 'review', 'user', 'provider', 'group', 'appeal'] })
    contentType: string;

    @Column({ name: 'content_id' })
    contentId: number;

    @Column({ type: 'enum', enum: ['spam', 'hate_speech', 'scam', 'other', 'appeal'] })
    reason: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ default: 'pending' })
    status: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    // Relaciones para enriquecer los reportes en el panel de admin
    @ManyToOne(() => User, { eager: false, nullable: true })
    @JoinColumn({ name: 'reporter_id' })
    reporter: User;

    @ManyToOne(() => User, { eager: false, nullable: true })
    @JoinColumn({ name: 'reported_user_id' })
    reportedUser: User;
}
