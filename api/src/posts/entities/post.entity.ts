import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, JoinTable, ManyToMany, OneToMany } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Vehicle } from '../../vehicles/entities/vehicle.entity';
import { Tag } from './tag.entity';
import { Provider } from '../../providers/entities/provider.entity';
import { Comment } from '../../comments/entities/comment.entity';

@Entity('posts')
export class Post {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'author_id' })
    authorId: number;

    @ManyToMany(() => Tag, (tag) => tag.posts, { cascade: true })
    @JoinTable({
        name: 'post_tags', // Nombre exacto de tu tabla intermedia en SQL
        joinColumn: { name: 'post_id', referencedColumnName: 'id' },
        inverseJoinColumn: { name: 'tag_id', referencedColumnName: 'id' }
    })
    tags: Tag[];

    @Column({ name: 'vehicle_id', nullable: true })
    vehicleId: number;

    @Column({ name: 'provider_id', nullable: true })
    providerId: number;

    @Column({ type: 'text', nullable: true })
    content: string;

    @Column({ name: 'media_url', nullable: true })
    mediaUrl: string;

    // 👇👇👇 AGREGA ESTOS CAMPOS NUEVOS 👇👇👇

    @Column({ name: 'is_poll', default: false })
    isPoll: boolean;

    // Usamos type: 'json' para que MySQL guarde el array ["Opción A", "Opción B"] automáticamente
    @Column({ name: 'poll_options', type: 'json', nullable: true })
    pollOptions: any;

    @Column({ name: 'is_solved', default: false })
    isSolved: boolean;

    @Column({ default: 'public' }) // Ya no es un Enum estricto, es un string abierto
    visibility: string;

    // 👆👆👆 FIN CAMPOS NUEVOS 👆👆👆

    @Column({ name: 'comments_count', default: 0 })
    commentsCount: number;

    @Column({ name: 'likes_count', default: 0 })
    likesCount: number;

    @Column({ type: 'enum', enum: ['active', 'hidden', 'flagged'], default: 'active' })
    status: string;

    @Column({ name: 'is_professional', default: false })
    isProfessional: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    // En post.entity.ts
    @Column({ type: 'decimal', precision: 10, scale: 8, nullable: true })
    lat: number;

    @Column({ type: 'decimal', precision: 11, scale: 8, nullable: true })
    lng: number;

    // Relaciones
    @ManyToOne(() => User)
    @JoinColumn({ name: 'author_id' })
    author: User;

    @ManyToOne(() => Vehicle)
    @JoinColumn({ name: 'vehicle_id' })
    vehicle: Vehicle;

    @ManyToOne(() => Provider)
    @JoinColumn({ name: 'provider_id' })
    provider: Provider;

    // Relación ManyToMany con Users para Likes
    @ManyToMany(() => User, (user) => user.likedPosts)
    @JoinTable({
        name: 'post_likes',
        joinColumn: { name: 'post_id', referencedColumnName: 'id' },
        inverseJoinColumn: { name: 'user_id', referencedColumnName: 'id' }
    })
    likes: User[];

    // Relación OneToMany con Comments
    @OneToMany(() => Comment, (comment) => comment.post)
    comments: Comment[];
}