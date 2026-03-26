import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { NotificationTriggerService } from '../notifications/notification-trigger.service';
import { Provider } from '../providers/entities/provider.entity';
import { User } from '../users/entities/user.entity';
import { StaffInvitation } from './entities/staff-invitation.entity';

@Injectable()
export class StaffService {
  constructor(
    @InjectRepository(StaffInvitation)
    private invitationsRepo: Repository<StaffInvitation>,
    @InjectRepository(User) private usersRepo: Repository<User>,
    @InjectRepository(Provider) private providersRepo: Repository<Provider>,
    private notificationTrigger: NotificationTriggerService,
  ) {}

  /**
   * Resuelve el provider al que pertenece un usuario (ya sea como dueño o como staff)
   */
  async resolveProviderForUser(userId: number): Promise<Provider | null> {
    // 1. Buscar como dueño
    const asOwner = await this.providersRepo.findOne({ where: { userId } });
    if (asOwner) return asOwner;

    // 2. Buscar como staff (via provider_id en users)
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (user?.providerId) {
      return this.providersRepo.findOne({ where: { id: user.providerId } });
    }

    return null;
  }

  /**
   * Invitar a un nuevo miembro al equipo
   */
  async invite(
    userId: number,
    email: string,
    role: 'provider_admin' | 'provider_staff',
  ) {
    // 1. Obtener usuario que invita
    const inviter = await this.usersRepo.findOne({ where: { id: userId } });
    if (!inviter) throw new NotFoundException('Usuario no encontrado');

    // 2. Resolver el provider del invitador
    const provider = await this.resolveProviderForUser(userId);
    if (!provider)
      throw new ForbiddenException('No tienes un negocio asociado');

    // 3. Verificar Premium
    if (!provider.isPremium) {
      throw new ForbiddenException(
        'La gestión de equipo requiere una suscripción Premium activa.',
      );
    }

    // 4. Jerarquía de roles: provider_admin solo puede invitar provider_staff
    if (inviter.role === 'provider_admin' && role === 'provider_admin') {
      throw new ForbiddenException(
        'Un administrador solo puede invitar operadores (staff).',
      );
    }

    // 5. Verificar que el email no sea del propio invitador
    if (inviter.email === email) {
      throw new BadRequestException('No puedes invitarte a ti mismo.');
    }

    // 6. Verificar si ya existe una invitación pendiente para este email en este provider
    const existingInvitation = await this.invitationsRepo.findOne({
      where: { providerId: provider.id, email, status: 'pending' },
    });
    if (existingInvitation) {
      throw new ConflictException(
        'Ya existe una invitación pendiente para este email.',
      );
    }

    // 7. Verificar si el usuario ya es miembro del equipo
    const existingMember = await this.usersRepo.findOne({
      where: { email, providerId: provider.id },
    });
    if (existingMember) {
      throw new ConflictException('Este usuario ya es miembro de tu equipo.');
    }

    // 8. Generar token único y fecha de expiración (72 horas)
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 72);

    // 9. Crear invitación
    const invitation = this.invitationsRepo.create({
      providerId: provider.id,
      invitedBy: userId,
      email,
      role,
      token,
      status: 'pending',
      expiresAt,
    });

    const saved = await this.invitationsRepo.save(invitation);

    // Disparar notificación de invitación de negocio
    this.notificationTrigger
      .onBusinessInvite(userId, email, provider.businessName)
      .catch(() => {});

    // TODO: Enviar email real con el token/link de invitación
    console.log(`=========================================`);
    console.log(`📧 INVITACIÓN DE STAFF`);
    console.log(`   Para: ${email}`);
    console.log(`   Rol: ${role}`);
    console.log(`   Negocio: ${provider.businessName}`);
    console.log(`   Token: ${token}`);
    console.log(`   Expira: ${expiresAt.toISOString()}`);
    console.log(`=========================================`);

    return {
      id: saved.id,
      email: saved.email,
      role: saved.role,
      status: saved.status,
      expiresAt: saved.expiresAt,
    };
  }

  /**
   * Obtener detalles de una invitación por token (sin autenticación requerida en sí,
   * pero protegida por JWT en el controlador). Permite mostrar la preview antes de aceptar.
   */
  async getInvitationByToken(token: string) {
    const invitation = await this.invitationsRepo.findOne({
      where: { token, status: 'pending' },
      relations: ['provider', 'inviter'],
    });

    if (!invitation) {
      throw new NotFoundException(
        'Invitación no encontrada o ya fue procesada.',
      );
    }

    if (new Date() > invitation.expiresAt) {
      invitation.status = 'expired';
      await this.invitationsRepo.save(invitation);
      throw new BadRequestException('La invitación ha expirado.');
    }

    return {
      id: invitation.id,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      inviter: {
        id: invitation.inviter.id,
        fullName: invitation.inviter.fullName,
        avatarUrl: invitation.inviter.avatarUrl ?? null,
      },
      business: {
        id: invitation.provider.id,
        name: invitation.provider.businessName,
        logoUrl: invitation.provider.logoUrl ?? null,
      },
    };
  }

  /**
   * Aceptar una invitación de staff
   */
  async acceptInvitation(userId: number, token: string) {
    // 1. Buscar invitación válida
    const invitation = await this.invitationsRepo.findOne({
      where: { token, status: 'pending' },
      relations: ['provider'],
    });

    if (!invitation) {
      throw new NotFoundException(
        'Invitación no encontrada o ya fue procesada.',
      );
    }

    // 2. Verificar expiración
    if (new Date() > invitation.expiresAt) {
      invitation.status = 'expired';
      await this.invitationsRepo.save(invitation);
      throw new BadRequestException('La invitación ha expirado.');
    }

    // 3. Verificar que el email del usuario coincida
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    if (user.email !== invitation.email) {
      throw new ForbiddenException(
        'Esta invitación no corresponde a tu cuenta.',
      );
    }

    // 4. Verificar que el usuario no sea ya un provider (dueño de negocio)
    if (user.role === 'provider') {
      throw new ConflictException(
        'Ya eres dueño de un negocio. No puedes unirte como staff a otro.',
      );
    }

    // 5. Verificar Premium del provider al momento de aceptar
    if (!invitation.provider.isPremium) {
      throw new ForbiddenException(
        'El negocio ya no tiene suscripción Premium activa.',
      );
    }

    // 6. Actualizar usuario: asignar rol y vincular al provider
    user.role = invitation.role;
    user.providerId = invitation.providerId;
    await this.usersRepo.save(user);

    // 7. Marcar invitación como aceptada
    invitation.status = 'accepted';
    await this.invitationsRepo.save(invitation);

    return {
      message: `Te has unido al equipo de ${invitation.provider.businessName} como ${invitation.role === 'provider_admin' ? 'Administrador' : 'Operador'}.`,
      role: invitation.role,
      providerId: invitation.providerId,
      businessName: invitation.provider.businessName,
      businessLogo: invitation.provider.logoUrl ?? null,
    };
  }

  /**
   * Listar invitaciones del negocio
   */
  async getInvitations(userId: number) {
    const provider = await this.resolveProviderForUser(userId);
    if (!provider)
      throw new ForbiddenException('No tienes un negocio asociado');

    return this.invitationsRepo.find({
      where: { providerId: provider.id },
      relations: ['inviter'],
      order: { createdAt: 'DESC' },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        inviter: {
          id: true,
          fullName: true,
        },
      },
    });
  }

  /**
   * Listar miembros del equipo
   */
  async getMembers(userId: number) {
    const provider = await this.resolveProviderForUser(userId);
    if (!provider)
      throw new ForbiddenException('No tienes un negocio asociado');

    // Obtener el dueño
    const owner = await this.usersRepo.findOne({
      where: { id: provider.userId },
      select: ['id', 'fullName', 'avatarUrl', 'email', 'role'],
    });

    // Obtener staff
    const staffMembers = await this.usersRepo.find({
      where: { providerId: provider.id },
      select: ['id', 'fullName', 'avatarUrl', 'email', 'role'],
    });

    const members: {
      id: number;
      fullName: string;
      avatarUrl: string | null;
      email: string;
      role: string;
      isOwner: boolean;
    }[] = [];

    // El dueño siempre va primero
    if (owner) {
      members.push({
        id: owner.id,
        fullName: owner.fullName,
        avatarUrl: owner.avatarUrl,
        email: owner.email,
        role: owner.role,
        isOwner: true,
      });
    }

    // Staff members
    for (const member of staffMembers) {
      members.push({
        id: member.id,
        fullName: member.fullName,
        avatarUrl: member.avatarUrl,
        email: member.email,
        role: member.role,
        isOwner: false,
      });
    }

    return members;
  }

  /**
   * Cambiar el rol de un miembro del equipo (ascender o degradar)
   */
  async changeRole(userId: number, memberUserId: number, newRole: 'provider_admin' | 'provider_staff') {
    const provider = await this.resolveProviderForUser(userId);
    if (!provider) throw new ForbiddenException('No tienes un negocio asociado');

    // Solo el dueño puede cambiar roles
    if (provider.userId !== userId) {
      throw new ForbiddenException('Solo el dueño del negocio puede cambiar roles.');
    }

    // No puedes cambiar el rol del dueño
    if (memberUserId === provider.userId) {
      throw new ForbiddenException('No puedes cambiar el rol del dueño del negocio.');
    }

    const member = await this.usersRepo.findOne({
      where: { id: memberUserId, providerId: provider.id },
    });
    if (!member) throw new NotFoundException('Miembro no encontrado en tu equipo.');

    member.role = newRole;
    await this.usersRepo.save(member);

    return { message: `El rol de ${member.fullName} ha sido actualizado a ${newRole === 'provider_admin' ? 'Administrador' : 'Operador'}.` };
  }

  /**
   * Eliminar un miembro del equipo
   */
  async removeMember(userId: number, memberUserId: number) {
    const provider = await this.resolveProviderForUser(userId);
    if (!provider)
      throw new ForbiddenException('No tienes un negocio asociado');

    // No puedes eliminar al dueño
    if (memberUserId === provider.userId) {
      throw new ForbiddenException('No puedes eliminar al dueño del negocio.');
    }

    // Verificar que el miembro pertenece a este provider
    const member = await this.usersRepo.findOne({
      where: { id: memberUserId, providerId: provider.id },
    });
    if (!member)
      throw new NotFoundException('Miembro no encontrado en tu equipo.');

    // Jerarquía: provider_admin no puede eliminar a otro provider_admin
    const inviter = await this.usersRepo.findOne({ where: { id: userId } });
    if (
      inviter?.role === 'provider_admin' &&
      member.role === 'provider_admin'
    ) {
      throw new ForbiddenException(
        'Un administrador no puede eliminar a otro administrador.',
      );
    }

    // Desvincular: cambiar rol a 'user' y quitar providerId
    member.role = 'user';
    member.providerId = null;
    await this.usersRepo.save(member);

    return { message: `${member.fullName} ha sido eliminado del equipo.` };
  }

  /**
   * Obtener invitaciones pendientes para el usuario actual (por su email)
   */
  async getMyPendingInvitations(userId: number) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const invitations = await this.invitationsRepo.find({
      where: { email: user.email, status: 'pending' },
      relations: ['provider'],
      order: { createdAt: 'DESC' },
    });

    // Filtrar expiradas y marcarlas
    const valid: any[] = [];
    for (const inv of invitations) {
      if (new Date() > inv.expiresAt) {
        inv.status = 'expired';
        await this.invitationsRepo.save(inv);
      } else {
        valid.push({
          id: inv.id,
          token: inv.token,
          role: inv.role,
          businessName: inv.provider?.businessName || 'Negocio',
          businessLogo: inv.provider?.logoUrl || null,
          expiresAt: inv.expiresAt,
          createdAt: inv.createdAt,
        });
      }
    }

    return valid;
  }

  /**
   * Abandonar el equipo (solo provider_staff y provider_admin)
   */
  async leaveTeam(userId: number) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    if (!['provider_admin', 'provider_staff'].includes(user.role)) {
      throw new ForbiddenException(
        'Solo miembros del equipo pueden abandonar un negocio.',
      );
    }

    if (!user.providerId) {
      throw new BadRequestException('No estás vinculado a ningún negocio.');
    }

    user.role = 'user';
    user.providerId = null;
    await this.usersRepo.save(user);

    return { message: 'Has abandonado el equipo correctamente.' };
  }

  /**
   * Cancelar una invitación pendiente
   */
  async cancelInvitation(userId: number, invitationId: number) {
    const provider = await this.resolveProviderForUser(userId);
    if (!provider)
      throw new ForbiddenException('No tienes un negocio asociado');

    const invitation = await this.invitationsRepo.findOne({
      where: { id: invitationId, providerId: provider.id, status: 'pending' },
    });

    if (!invitation) {
      throw new NotFoundException(
        'Invitación no encontrada o ya fue procesada.',
      );
    }

    invitation.status = 'cancelled';
    await this.invitationsRepo.save(invitation);

    return { message: 'Invitación cancelada.' };
  }
}
