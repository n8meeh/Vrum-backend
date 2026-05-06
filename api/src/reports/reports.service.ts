import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContentReport } from './entities/report.entity';
import { CreateReportDto } from './dto/create-report.dto';
import { CreateAppealDto } from './dto/create-appeal.dto';
import { ResolveReportDto } from './dto/resolve-report.dto';
import { Post } from '../posts/entities/post.entity';
import { Comment } from '../comments/entities/comment.entity';
import { Provider } from '../providers/entities/provider.entity';
import { User } from '../users/entities/user.entity';
import { Order } from '../orders/entities/order.entity';
import { Negotiation } from '../negotiations/entities/negotiation.entity';
import { Review } from '../reviews/entities/review.entity';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ReportsService {
    constructor(
        @InjectRepository(ContentReport) private reportRepo: Repository<ContentReport>,
        @InjectRepository(Post) private postRepo: Repository<Post>,
        @InjectRepository(Comment) private commentRepo: Repository<Comment>,
        @InjectRepository(Provider) private providerRepo: Repository<Provider>,
        @InjectRepository(User) private userRepo: Repository<User>,
        @InjectRepository(Order) private orderRepo: Repository<Order>,
        @InjectRepository(Negotiation) private negotiationRepo: Repository<Negotiation>,
        @InjectRepository(Review) private reviewRepo: Repository<Review>,
        private notificationsService: NotificationsService,
    ) { }

    /**
     * Verifica si existe interacción (chat) entre un usuario y un proveedor
     * a través de order_negotiations.
     */
    private async hasInteraction(userId: number, providerId: number): Promise<boolean> {
        const count = await this.orderRepo
            .createQueryBuilder('order')
            .innerJoin('order_negotiations', 'neg', 'neg.order_id = order.id')
            .where('order.clientId = :userId AND order.providerId = :providerId', { userId, providerId })
            .orWhere('neg.author_id = :userId AND order.providerId = :providerId', { userId, providerId })
            .getCount();
        return count > 0;
    }

    async create(reporterId: number, dto: CreateReportDto) {
        // Determinar el reportedUserId según el contentType
        let reportedUserId = dto.reportedUserId;

        if (!reportedUserId) {
            switch (dto.contentType) {
                case 'post':
                    const post = await this.postRepo.findOne({ where: { id: dto.contentId } });
                    if (!post) throw new NotFoundException('Post no encontrado');
                    reportedUserId = post.authorId;
                    break;

                case 'comment':
                    const comment = await this.commentRepo.findOne({ where: { id: dto.contentId } });
                    if (!comment) throw new NotFoundException('Comentario no encontrado');
                    reportedUserId = comment.authorId;
                    break;

                case 'provider':
                    const provider = await this.providerRepo.findOne({ where: { id: dto.contentId } });
                    if (!provider) throw new NotFoundException('Proveedor no encontrado');
                    reportedUserId = provider.userId;
                    break;

                case 'user':
                    reportedUserId = dto.contentId;
                    break;

                default:
                    throw new NotFoundException('Tipo de contenido no válido');
            }
        }

        // Bloqueo de duplicados: Un usuario solo puede reportar el mismo contenido específico una vez
        const existingReport = await this.reportRepo.findOne({
            where: {
                reporterId,
                contentType: dto.contentType,
                contentId: dto.contentId,
                status: 'pending',
            },
        });
        if (existingReport) {
            throw new BadRequestException('Ya tienes un reporte pendiente para este contenido.');
        }

        // Validación: para reportar un negocio se debe tener al menos una orden con él (en cualquier estado)
        if (dto.contentType === 'provider') {
            const hasOrder = await this.orderRepo.count({
                where: { clientId: reporterId, providerId: dto.contentId },
            });
            if (!hasOrder) {
                throw new BadRequestException(
                    'Solo puedes reportar un negocio si has tenido al menos una solicitud u orden con él.',
                );
            }
        }

        const report = this.reportRepo.create({
            ...dto,
            reporterId,
            reportedUserId,
        });
        const savedReport = await this.reportRepo.save(report);

        // Degradación automática: Si un proveedor verificado (estado 1) recibe 3+ reportes válidos → estado 2
        if (dto.contentType === 'provider') {
            await this.checkAutoDowngrade(dto.contentId);
        }

        return savedReport;
    }

    /**
     * Verifica si un proveedor debe ser degradado automáticamente.
     * Si tiene 3+ reportes válidos pendientes y está en estado 1 (Verificado) → pasa a 2 (En Investigación).
     */
    private async checkAutoDowngrade(providerId: number) {
        const provider = await this.providerRepo.findOne({ where: { id: providerId } });
        if (!provider || provider.isVerified !== 1) return;

        // Contar reportes pendientes de tipo "provider" con interacción validada
        const pendingReportsCount = await this.reportRepo.count({
            where: {
                contentType: 'provider',
                contentId: providerId,
                status: 'pending',
            },
        });

        if (pendingReportsCount >= 3) {
            provider.isVerified = 2; // En Investigación
            await this.providerRepo.save(provider);

            // Notificar al proveedor
            await this.notificationsService.createInApp(
                provider.userId,
                '⚠️ Tu negocio está en revisión',
                'Hemos recibido múltiples reportes sobre tu negocio. Estamos investigando la situación. Durante este período tu badge de verificación se mostrará como "En Revisión".',
            );
        }
    }

    /**
     * Elimina el contenido reportado según su tipo.
     */
    private async deleteReportedContent(contentType: string, contentId: number): Promise<void> {
        switch (contentType) {
            case 'post':
                await this.postRepo.delete({ id: contentId });
                break;
            case 'comment':
                await this.commentRepo.delete({ id: contentId });
                break;
            case 'review':
                await this.reviewRepo.delete({ id: contentId });
                break;
            case 'provider':
                await this.providerRepo.update(contentId, { isVisible: false, isVerified: 3 });
                break;
            case 'user':
                await this.userRepo.softDelete({ id: contentId });
                break;
        }
    }

    /**
     * Devuelve todos los reportes pendientes con datos del reportero y reportado.
     * Solo accesible para admins.
     */
    async findAllPending() {
        const reports = await this.reportRepo.createQueryBuilder('report')
            .leftJoinAndSelect('report.reporter', 'reporter')
            .leftJoinAndSelect('report.reportedUser', 'reportedUser')
            .where('report.status = :status', { status: 'pending' })
            .orderBy('report.createdAt', 'DESC')
            .getMany();

        // Enriquecer reportes con datos extra según tipo de contenido
        for (const report of reports) {
            if (report.contentType === 'provider') {
                const hasChat = await this.hasInteraction(report.reporterId, report.contentId);
                (report as any).hasInteraction = hasChat;

                // Agregar info del provider
                const provider = await this.providerRepo.findOne({
                    where: { id: report.contentId },
                    select: ['id', 'businessName', 'isVerified'],
                });
                (report as any).provider = provider;
            } else if (report.contentType === 'comment') {
                // Agregar datos del comentario (contenido + postId) para contexto
                const comment = await this.commentRepo.findOne({
                    where: { id: report.contentId },
                    select: ['id', 'content', 'postId'],
                });
                (report as any).comment = comment ?? null;
            }

            // Agregar strikesCount y bannedUntil del usuario reportado
            // (estos campos tienen @Exclude() en el entity, por eso se adjuntan directamente al reporte)
            const userStats = await this.userRepo.findOne({
                where: { id: report.reportedUserId },
                select: ['id', 'strikesCount', 'bannedUntil'],
            });
            (report as any).reportedUserStrikesCount = userStats?.strikesCount ?? 0;
            (report as any).reportedUserBannedUntil = userStats?.bannedUntil ?? null;
        }

        return reports;
    }

    /**
     * Resuelve un reporte con una de las tres acciones: dismiss, strike, ban.
     * Solo accesible para admins.
     */
    async resolve(id: number, dto: ResolveReportDto) {
        const report = await this.reportRepo.findOne({ where: { id } });
        if (!report) throw new NotFoundException('Reporte no encontrado');

        const { action, banDays = 7 } = dto;

        if (action === 'delete') {
            await this.deleteReportedContent(report.contentType, report.contentId);
            await this.notificationsService.createInApp(
                report.reportedUserId,
                '🗑️ Tu contenido ha sido eliminado',
                'Un administrador ha eliminado tu contenido por infringir las normas de la comunidad.',
            );
        } else if (action === 'strike') {
            await this.userRepo.increment({ id: report.reportedUserId }, 'strikesCount', 1);
            await this.notificationsService.createInApp(
                report.reportedUserId,
                '⚠️ Advertencia en tu cuenta',
                'Hemos recibido un reporte sobre tu contenido. Tu cuenta ha acumulado un strike adicional. Por favor, revisa las normas de la comunidad.',
            );
        } else if (action === 'ban') {
            const bannedUntil = new Date();
            bannedUntil.setDate(bannedUntil.getDate() + banDays);
            await this.userRepo.update(report.reportedUserId, { bannedUntil });

            // Si el reporte es de tipo provider, marcarlo como baneado (estado 3)
            if (report.contentType === 'provider') {
                const provider = await this.providerRepo.findOne({ where: { id: report.contentId } });
                if (provider) {
                    provider.isVerified = 3; // Baneado
                    provider.isVisible = false;
                    await this.providerRepo.save(provider);
                }
            }

            const bannedUntilStr = bannedUntil.toLocaleDateString('es-ES', {
                day: '2-digit', month: 'long', year: 'numeric',
            });
            const isProviderBan = report.contentType === 'provider';
            await this.notificationsService.createInApp(
                report.reportedUserId,
                isProviderBan ? '🚫 Tu negocio ha sido suspendido' : '🚫 Tu cuenta ha sido suspendida',
                isProviderBan
                    ? `Tu negocio ha sido suspendido debido a una infracción confirmada. La suspensión estará vigente hasta el ${bannedUntilStr}.`
                    : `Tu cuenta ha sido suspendida debido a una infracción confirmada. La suspensión estará vigente hasta el ${bannedUntilStr}.`,
            );
        } else if (action === 'dismiss') {
            // Si se desestima y el provider estaba en investigación, restaurar a verificado
            if (report.contentType === 'provider') {
                const provider = await this.providerRepo.findOne({ where: { id: report.contentId } });
                if (provider && provider.isVerified === 2) {
                    provider.isVerified = 1; // Restaurar a Verificado
                    await this.providerRepo.save(provider);
                    await this.notificationsService.createInApp(
                        provider.userId,
                        '✅ Tu negocio ha sido verificado nuevamente',
                        'La investigación sobre tu negocio ha sido resuelta satisfactoriamente. Tu badge de verificado ha sido restaurado.',
                    );
                }
            }
        }

        report.status = 'resolved';
        return this.reportRepo.save(report);
    }

    /**
     * Crea una apelación de suspensión (endpoint público, no requiere auth).
     * El usuario baneado no tiene token, así que se identifica por email.
     */
    async createAppeal(dto: CreateAppealDto) {
        // Buscar usuario por email
        const user = await this.userRepo.findOne({ where: { email: dto.email } });
        if (!user) {
            throw new NotFoundException('No se encontró una cuenta con ese email.');
        }

        // Verificar que realmente esté baneado
        if (!user.bannedUntil || new Date() >= new Date(user.bannedUntil)) {
            throw new BadRequestException('Tu cuenta no se encuentra suspendida actualmente.');
        }

        // Verificar que no tenga ya una apelación pendiente
        const existingAppeal = await this.reportRepo.findOne({
            where: {
                reportedUserId: user.id,
                contentType: 'appeal',
                status: 'pending',
            },
        });

        if (existingAppeal) {
            throw new BadRequestException('Ya tienes una apelación pendiente de revisión. Por favor espera a que sea procesada.');
        }

        // Crear apelación como ContentReport
        const appeal = this.reportRepo.create({
            reporterId: user.id,       // El que apela es el mismo usuario
            reportedUserId: user.id,   // Se reporta a sí mismo (apelación)
            contentType: 'appeal',
            contentId: user.id,
            reason: 'appeal',
            description: dto.message,
            status: 'pending',
        });

        await this.reportRepo.save(appeal);

        return { message: 'Tu apelación ha sido enviada. Será revisada por nuestro equipo.' };
    }
}
