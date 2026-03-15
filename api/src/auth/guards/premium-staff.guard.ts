import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Provider } from '../../providers/entities/provider.entity';

/**
 * PremiumStaffGuard: Verifica JWT + que el usuario tenga acceso al negocio.
 * Para staff (provider_admin, provider_staff): verifica que el provider sea Premium.
 * Para provider (dueño): permite siempre (el acceso premium es gateado en otros sitios).
 *
 * Adjunta `request.staffProvider` para uso downstream.
 *
 * Uso: @UseGuards(PremiumStaffGuard)
 */
@Injectable()
export class PremiumStaffGuard extends AuthGuard('jwt') implements CanActivate {
    constructor(
        @InjectRepository(Provider) private providersRepo: Repository<Provider>,
    ) {
        super();
    }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        // 1. Validar JWT
        await super.canActivate(context);

        const request = context.switchToHttp().getRequest();
        const user = request.user;

        if (!user) {
            throw new ForbiddenException('Tu sesión ha expirado. Inicia sesión nuevamente.');
        }

        const role = user.role;

        // 2. Solo aplica a roles del negocio
        if (!['provider', 'provider_admin', 'provider_staff'].includes(role)) {
            throw new ForbiddenException('Acceso restringido a miembros de un negocio.');
        }

        // 3. Resolver el provider
        let provider: Provider | null = null;

        if (role === 'provider') {
            // Dueño: buscar por userId
            provider = await this.providersRepo.findOne({ where: { userId: user.id } });
        } else {
            // Staff: buscar por providerId del JWT/user
            if (user.providerId) {
                provider = await this.providersRepo.findOne({ where: { id: user.providerId } });
            }
        }

        if (!provider) {
            throw new ForbiddenException('No se encontró un negocio asociado a tu cuenta.');
        }

        // 4. Para staff, verificar Premium
        if (['provider_admin', 'provider_staff'].includes(role) && !provider.isPremium) {
            throw new ForbiddenException(
                'Acceso de equipo suspendido. El negocio requiere una suscripción Premium activa.',
            );
        }

        // 5. Adjuntar provider para uso downstream
        request.staffProvider = provider;

        return true;
    }
}
