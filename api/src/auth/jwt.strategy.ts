import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { Provider } from '../providers/entities/provider.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        private usersService: UsersService,
        @InjectRepository(Provider) private providersRepo: Repository<Provider>,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: process.env.JWT_SECRET || 'CLAVE_SECRETA_SUPER_SEGURA',
        });
    }

    async validate(payload: any) {
        // Verificar que el sessionToken del JWT coincida con el almacenado en BD.
        const user = await this.usersService.findByIdForSession(Number(payload.sub));

        if (!user) {
            throw new UnauthorizedException('Usuario no encontrado');
        }

        if (user.currentSessionToken !== payload.sessionToken) {
            throw new UnauthorizedException(
                'Sesión inválida o expirada. Por favor inicia sesión de nuevo.',
            );
        }

        // Verificar si el usuario está baneado
        if (user.bannedUntil && new Date() < new Date(user.bannedUntil)) {
            const bannedUntilDate = new Date(user.bannedUntil).toLocaleDateString('es-ES', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
            });
            throw new ForbiddenException(
                `Tu cuenta está suspendida hasta el ${bannedUntilDate}. Razón: Acumulación de strikes.`,
            );
        }

        // Resolver providerId:
        // - Staff (provider_admin/provider_staff): user.providerId en tabla users
        // - Dueño (provider): buscar en tabla providers por userId
        let providerId: number | null = user.providerId || null;

        if (!providerId && user.role === 'provider') {
            const provider = await this.providersRepo.findOne({
                where: { userId: Number(payload.sub) },
                select: ['id'],
            });
            providerId = provider?.id || null;
        }

        return {
            userId: Number(payload.sub),
            id: Number(payload.sub),
            email: payload.email,
            role: user.role,
            providerId: providerId,
        };
    }
}
