import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Provider } from '../providers/entities/provider.entity';
import { Post } from '../posts/entities/post.entity';
import { Group } from '../groups/entities/group.entity';

@Injectable()
export class AdminService {
    private readonly logger = new Logger(AdminService.name);

    constructor(
        @InjectRepository(User) private usersRepo: Repository<User>,
        @InjectRepository(Provider) private providersRepo: Repository<Provider>,
        @InjectRepository(Post) private postsRepo: Repository<Post>,
        @InjectRepository(Group) private groupsRepo: Repository<Group>,
    ) {}

    /**
     * Calcula la duración del ban según el número de strike.
     * Strike 1 → 24 horas
     * Strike 2 → 7 días
     * Strike 3+ → permanente (10 años)
     */
    private calculateBanDuration(strikeNumber: number): Date {
        const now = new Date();

        if (strikeNumber === 1) {
            // 24 horas
            return new Date(now.getTime() + 24 * 60 * 60 * 1000);
        }
        if (strikeNumber === 2) {
            // 7 días
            return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        }
        // 3+: ban permanente (10 años)
        return new Date(now.getFullYear() + 10, now.getMonth(), now.getDate());
    }

    /**
     * Aplica un strike al usuario y calcula el ban correspondiente.
     * Si el usuario es provider, oculta su negocio y publicaciones.
     */
    async applyStrike(userId: number) {
        const user = await this.usersRepo.findOne({
            where: { id: userId },
            relations: ['provider'],
        });

        if (!user) {
            throw new NotFoundException('Usuario no encontrado');
        }

        // Incrementar strikes
        user.strikesCount = (user.strikesCount || 0) + 1;

        // Calcular ban
        const bannedUntil = this.calculateBanDuration(user.strikesCount);
        user.bannedUntil = bannedUntil;

        await this.usersRepo.save(user);

        // Si es provider, ocultar negocio y publicaciones
        if (['provider', 'provider_admin', 'provider_staff'].includes(user.role)) {
            await this.hideProviderData(user);
        }

        // Ocultar publicaciones del usuario (sea provider o user normal)
        await this.hideUserPosts(userId);

        const banLabel = user.strikesCount >= 3
            ? 'permanente'
            : user.strikesCount === 2
                ? '7 días'
                : '24 horas';

        this.logger.warn(
            `Strike #${user.strikesCount} aplicado a usuario ${userId}. Ban: ${banLabel} (hasta ${bannedUntil.toISOString()})`,
        );

        return {
            userId: user.id,
            strikesCount: user.strikesCount,
            bannedUntil,
            banDuration: banLabel,
        };
    }

    /**
     * Oculta el negocio (is_visible = false) del provider baneado.
     */
    private async hideProviderData(user: User) {
        // El usuario puede ser el dueño del negocio
        const provider = await this.providersRepo.findOne({
            where: { userId: user.id },
        });

        if (provider) {
            provider.isVisible = false;
            await this.providersRepo.save(provider);
            this.logger.warn(`Negocio ${provider.id} (${provider.businessName}) ocultado por ban del usuario ${user.id}`);
        }

        // Si es staff, ocultar el negocio al que pertenece
        if (user.providerId) {
            const staffProvider = await this.providersRepo.findOne({
                where: { id: user.providerId },
            });
            // Solo ocultar si el dueño del negocio también está baneado
            // Para staff individual, no ocultamos el negocio completo
            if (staffProvider && user.role === 'provider') {
                staffProvider.isVisible = false;
                await this.providersRepo.save(staffProvider);
            }
        }
    }

    /**
     * Oculta todas las publicaciones activas del usuario (status → 'hidden').
     */
    private async hideUserPosts(userId: number) {
        const result = await this.postsRepo
            .createQueryBuilder()
            .update(Post)
            .set({ status: 'hidden' })
            .where('author_id = :userId', { userId })
            .andWhere('status = :status', { status: 'active' })
            .execute();

        if (result.affected && result.affected > 0) {
            this.logger.warn(`${result.affected} publicación(es) ocultada(s) del usuario ${userId}`);
        }
    }

    /**
     * Desbanea a un usuario manualmente. Restaura visibilidad del negocio y publicaciones.
     */
    async unbanUser(userId: number) {
        const user = await this.usersRepo.findOne({ where: { id: userId } });
        if (!user) {
            throw new NotFoundException('Usuario no encontrado');
        }

        user.bannedUntil = null;
        // No reseteamos strikesCount — los strikes son permanentes
        await this.usersRepo.save(user);

        // Restaurar visibilidad del negocio si es provider
        if (['provider', 'provider_admin'].includes(user.role)) {
            const provider = await this.providersRepo.findOne({ where: { userId } });
            if (provider) {
                provider.isVisible = true;
                await this.providersRepo.save(provider);
            }
        }

        // Restaurar publicaciones ocultas por ban
        await this.postsRepo
            .createQueryBuilder()
            .update(Post)
            .set({ status: 'active' })
            .where('author_id = :userId', { userId })
            .andWhere('status = :status', { status: 'hidden' })
            .execute();

        this.logger.log(`Usuario ${userId} desbaneado manualmente`);

        return {
            userId: user.id,
            strikesCount: user.strikesCount,
            bannedUntil: null,
        };
    }

    /**
     * Actualiza el estado de verificación de un proveedor.
     * isVerified: 0=Nuevo, 1=Verificado, 2=En Investigación, 3=Baneado
     * Si pasa a 3 (Baneado), también se oculta el negocio.
     * Si sale de 3, se restaura la visibilidad.
     */
    async updateProviderVerification(providerId: number, isVerified: number) {
        const provider = await this.providersRepo.findOne({ where: { id: providerId } });
        if (!provider) throw new NotFoundException('Proveedor no encontrado');

        provider.isVerified = Number(isVerified);
        provider.isVisible = Number(isVerified) !== 3;
        await this.providersRepo.save(provider);

        this.logger.log(`Proveedor ${providerId} actualizado a isVerified=${isVerified} por admin`);

        return { providerId, isVerified, isVisible: provider.isVisible };
    }

    /**
     * Consulta el estado de moderación de un usuario.
     */
    async getUserModerationInfo(userId: number) {
        const user = await this.usersRepo.findOne({
            where: { id: userId },
            select: ['id', 'fullName', 'email', 'role', 'strikesCount', 'bannedUntil', 'isVisible'],
        });

        if (!user) {
            throw new NotFoundException('Usuario no encontrado');
        }

        const isBanned = user.bannedUntil && new Date() < new Date(user.bannedUntil);

        return {
            id: user.id,
            fullName: user.fullName,
            email: user.email,
            role: user.role,
            strikesCount: user.strikesCount,
            bannedUntil: user.bannedUntil,
            isBanned: !!isBanned,
            isVisible: user.isVisible,
        };
    }

    /**
     * Elimina (oculta) un post desde el panel de administración,
     * sin verificar propiedad del autor.
     */
    async adminDeletePost(postId: number) {
        const post = await this.postsRepo.findOne({ where: { id: postId } });
        if (!post) throw new NotFoundException('Publicación no encontrada');

        post.status = 'hidden';
        await this.postsRepo.save(post);

        this.logger.warn(`Admin eliminó el post ${postId}`);

        return { message: 'Publicación eliminada correctamente' };
    }

    /**
     * Desactiva un grupo desde el panel de administración.
     */
    async adminDeleteGroup(groupId: number) {
        const group = await this.groupsRepo.findOne({ where: { id: groupId } });
        if (!group) throw new NotFoundException('Grupo no encontrado');

        group.isActive = false;
        await this.groupsRepo.save(group);

        this.logger.warn(`Admin desactivó el grupo ${groupId}`);

        return { message: 'Grupo eliminado correctamente' };
    }
}
