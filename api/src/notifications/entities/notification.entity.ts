import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

export type NotificationType =
    | 'social_like'
    | 'social_comment'
    | 'social_follow'
    | 'order_update'
    | 'chat_message'
    | 'post_solved'
    | 'group_join_request'
    | 'group_request_update'
    | 'system';

@Entity('notifications')
export class Notification {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'user_id' })
    userId: number;

    @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    @Column({
        type: 'enum',
        enum: ['social_like', 'social_comment', 'social_follow', 'order_update', 'chat_message', 'post_solved', 'group_join_request', 'group_request_update', 'system'],
        default: 'system',
    })
    type: NotificationType;

    @Column({ type: 'varchar', length: 100, nullable: true })
    title: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    body: string;

    @Column({ name: 'related_id', nullable: true })
    relatedId: number;

    @Column({ name: 'is_read', default: false })
    isRead: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
