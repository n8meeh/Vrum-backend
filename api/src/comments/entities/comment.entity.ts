import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, DeleteDateColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Post } from '../../posts/entities/post.entity';

@Entity('comments') // <--- NOMBRE EXACTO DE TU TABLA EN FOTO
export class Comment {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'post_id' })
    postId: number;

    @ManyToOne(() => Post)
    @JoinColumn({ name: 'post_id' })
    post: Post;

    @Column({ name: 'author_id' })
    authorId: number;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'author_id' })
    author: User;

    @Column({ type: 'text' })
    content: string;

    // ESTA COLUMNA ESTÁ EN TU FOTO Y ES GENIAL
    @Column({ name: 'is_solution', default: false })
    isSolution: boolean;

    @Column({ name: 'is_professional', default: false })
    isProfessional: boolean;

    @Column({ name: 'provider_id', nullable: true })
    providerId: number | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @DeleteDateColumn({ name: 'deleted_at', nullable: true })
    deletedAt: Date | null;
}