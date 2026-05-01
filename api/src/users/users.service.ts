import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { In, IsNull, MoreThan, Repository } from 'typeorm';
import { GroupsService } from '../groups/groups.service';
import { NotificationTriggerService } from '../notifications/notification-trigger.service';
import { Post } from '../posts/entities/post.entity';
import { Provider } from '../providers/entities/provider.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserBlock } from './entities/user-block.entity';
import { UserFollow } from './entities/user-follow.entity';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private usersRepository: Repository<User>,
    @InjectRepository(UserBlock) private blockRepo: Repository<UserBlock>,
    @InjectRepository(UserFollow) private followRepo: Repository<UserFollow>,
    @InjectRepository(Vehicle) private vehicleRepo: Repository<Vehicle>,
    @InjectRepository(Post) private postRepo: Repository<Post>,
    @InjectRepository(Provider) private providerRepo: Repository<Provider>,
    private notificationTrigger: NotificationTriggerService,
    private groupsService: GroupsService,
  ) {}

  /**
   * Toggle de Bloqueo: Bloquea si no está bloqueado, desbloquea si ya lo está
   */
  async toggleBlock(blockerId: number, blockedId: number) {
    if (blockerId === blockedId) {
      throw new BadRequestException('No puedes bloquearte a ti mismo');
    }

    // Verificar si el usuario objetivo existe
    const targetUser = await this.usersRepository.findOne({
      where: { id: blockedId },
    });
    if (!targetUser) throw new NotFoundException('Usuario no encontrado');

    // Buscar si ya existe un bloqueo
    const existingBlock = await this.blockRepo.findOne({
      where: { blockerId, blockedId },
    });

    if (existingBlock) {
      // Ya está bloqueado → DESBLOQUEAR
      await this.blockRepo.remove(existingBlock);
      return {
        status: 'unblocked',
        message: `Has desbloqueado a ${targetUser.fullName}`,
      };
    } else {
      // No está bloqueado → BLOQUEAR
      const newBlock = this.blockRepo.create({ blockerId, blockedId });
      await this.blockRepo.save(newBlock);

      // Ruptura automática de seguimientos en ambas direcciones
      await this.followRepo.delete({ followerId: blockerId, followedId: blockedId });
      await this.followRepo.delete({ followerId: blockedId, followedId: blockerId });

      return {
        status: 'blocked',
        message: `Has bloqueado a ${targetUser.fullName}`,
      };
    }
  }

  async saveResetToken(userId: number, token: string, expires: Date) {
    return this.usersRepository.update(userId, {
      resetPasswordToken: token,
      resetPasswordExpires: expires,
    });
  }

  // Buscar por token válido (que no haya expirado)
  async findByResetToken(token: string) {
    return this.usersRepository.findOne({
      where: {
        resetPasswordToken: token,
        resetPasswordExpires: MoreThan(new Date()),
      },
    });
  }

  // Buscar por email + código de 6 dígitos válido (no expirado)
  async findByEmailAndResetCode(email: string, code: string) {
    return this.usersRepository.findOne({
      where: {
        email,
        resetPasswordToken: code,
        resetPasswordExpires: MoreThan(new Date()),
      },
    });
  }

  // Cambiar clave y borrar token
  async updatePasswordAndClearToken(userId: number, hashedPassword: string) {
    return this.usersRepository.update(userId, {
      password: hashedPassword,
      // Gracias al cambio en el Paso 1, esto ya no dará error rojo
      resetPasswordToken: null,
      resetPasswordExpires: null,
    });
  }
  /**
   * Actualiza el rol de un usuario
   * @param userId ID del usuario
   * @param newRole Nuevo rol (user, provider, admin)
   */
  async updateRole(
    userId: number,
    newRole:
      | 'user'
      | 'provider'
      | 'provider_admin'
      | 'provider_staff'
      | 'admin',
  ) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    user.role = newRole;
    const updatedUser = await this.usersRepository.save(user);

    return updatedUser;
  }

  async create(createUserDto: CreateUserDto) {
    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(createUserDto.password, salt);
    const newUser = this.usersRepository.create({
      ...createUserDto,
      password: hashedPassword,
      role: createUserDto.role || 'user',
    });
    return await this.usersRepository.save(newUser);
  }

  async remove(id: number) {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    // Si el usuario es provider, desactivar su negocio
    if (user.role === 'provider') {
      const provider = await this.providerRepo.findOne({
        where: { userId: id },
      });
      if (provider) {
        provider.isVisible = false;
        await this.providerRepo.save(provider);
      }
    }

    // Manejar los grupos donde el usuario es creador: transferir o cerrar
    const creatorGroups = await this.groupsService.findGroupsCreatedBy(id);
    for (const group of creatorGroups) {
      await this.groupsService.closeGroup(group.id, id);
    }

    // Eliminar al usuario de todos los grupos donde es miembro (no creador)
    await this.groupsService.removeUserFromAllGroups(id);

    user.deletedAt = new Date();
    user.isVisible = false;
    user.email = `deleted_${Date.now()}_${user.email}`;
    user.fullName = 'Usuario Eliminado';

    // Solución al error de tipos: Casting a 'any' o asegurar que la entidad acepte null
    user.avatarUrl = null;
    user.fcmToken = null;
    user.currentSessionToken = null;

    return await this.usersRepository.save(user);
  }

  /**
   * Obtener perfil completo del usuario con contadores sociales
   * Usado para GET /users/profile (mi perfil) y GET /users/:id (perfil de otro)
   */
  async findOne(id: number) {
    const user = await this.usersRepository.findOne({
      where: { id },
      relations: ['provider', 'staffProvider'],
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        providerId: true,
        avatarUrl: true,
        createdAt: true,
        bio: true,
        solutionsCount: true,
        isVisible: true,
        strikesCount: true,
        provider: {
          id: true,
          businessName: true,
        },
        staffProvider: {
          id: true,
          businessName: true,
        },
      },
    });

    if (!user) throw new NotFoundException('Usuario no encontrado');

    // ➕ Contar seguidores (quiénes me siguen) — excluir usuarios eliminados
    const followersCount = await this.followRepo
      .createQueryBuilder('f')
      .innerJoin('users', 'u', 'u.id = f.followerId AND u.deleted_at IS NULL')
      .where('f.followedId = :id', { id })
      .getCount();

    // ➕ Contar seguidos (a quiénes sigo) — excluir usuarios eliminados
    const followingCount = await this.followRepo
      .createQueryBuilder('f')
      .innerJoin('users', 'u', 'u.id = f.followedId AND u.deleted_at IS NULL')
      .where('f.followerId = :id', { id })
      .getCount();

    // ➕ Contar publicaciones activas
    const postsCount = await this.postRepo.count({
      where: {
        authorId: id,
        status: 'active',
      },
    });

    // Para staff: unificar provider para que el frontend siempre use user.provider
    // strikesCount se incluye explícitamente para el aviso preventivo en el frontend
    const result: any = {
      ...user,
      strikesCount: user.strikesCount || 0,
      followersCount,
      followingCount,
      postsCount,
    };

    // Si es staff y no tiene provider (dueño), usar staffProvider como provider
    if (!result.provider && result.staffProvider) {
      result.provider = result.staffProvider;
    }
    delete result.staffProvider;

    return result;
  }

  /**
   * Perfil Público Enriquecido con vehículos, contadores sociales y estado de seguimiento
   * @param id ID del usuario cuyo perfil se consulta
   * @param currentUserId ID del usuario que está consultando (opcional, para isFollowing)
   */
  async findPublicProfile(id: number, currentUserId?: number) {
    // 🔒 Bloqueo de Invisibilidad Total: si existe bloqueo en CUALQUIER dirección,
    // devolver 404 (no 403) para que el recurso sea técnicamente inexistente.
    if (currentUserId && Number(currentUserId) !== Number(id)) {
      const blockExists = await this.blockRepo.count({
        where: [
          { blockerId: Number(currentUserId), blockedId: Number(id) },
          { blockerId: Number(id), blockedId: Number(currentUserId) },
        ],
      });
      if (blockExists > 0) throw new NotFoundException('Usuario no encontrado');
    }

    const user = await this.usersRepository.findOne({
      where: { id },
      relations: ['provider'],
      select: {
        id: true,
        fullName: true,
        avatarUrl: true,
        role: true,
        bio: true,
        solutionsCount: true,
        createdAt: true,
        provider: {
          id: true,
          businessName: true,
          ratingAvg: true,
        },
      },
    });

    if (!user) throw new NotFoundException('Usuario no encontrado');

    // 1. Obtener vehículos no eliminados
    const vehicles = await this.vehicleRepo.find({
      where: {
        userId: id,
        deletedAt: IsNull(),
      },
      relations: ['vehicleType'],
      select: {
        id: true,
        alias: true,
        year: true,
        plate: true,
        photoUrl: true,
        brand: true,
        model: true,
        fuelType: true,
        transmission: true,
        engineSize: true,
        lastMileage: true,
        vehicleType: {
          id: true,
          name: true,
        },
      },
      order: { id: 'DESC' },
    });

    // 2. Contar seguidores (quienes siguen a este usuario) — excluir usuarios eliminados
    const followersCount = await this.followRepo
      .createQueryBuilder('f')
      .innerJoin('users', 'u', 'u.id = f.followerId AND u.deleted_at IS NULL')
      .where('f.followedId = :id', { id })
      .getCount();

    // 3. Contar seguidos (a quienes sigue este usuario) — excluir usuarios eliminados
    const followingCount = await this.followRepo
      .createQueryBuilder('f')
      .innerJoin('users', 'u', 'u.id = f.followedId AND u.deleted_at IS NULL')
      .where('f.followerId = :id', { id })
      .getCount();

    // 4. Verificar si el usuario actual lo está siguiendo
    let isFollowing = false;
    let isBlocked = false;

    // 🔍 DEBUG: Verificar tipos de datos antes de conversión

    // ✅ Convertir explícitamente a números para evitar problemas de comparación
    const userIdNum = currentUserId ? Number(currentUserId) : null;
    const profileIdNum = Number(id);

    if (userIdNum && !isNaN(userIdNum) && userIdNum !== profileIdNum) {
      // Buscar relación de seguimiento usando count() para mayor confiabilidad
      // followerId = quien sigue (currentUser)
      // followedId = quien es seguido (profile)
      const followCount = await this.followRepo.count({
        where: {
          followerId: userIdNum,
          followedId: profileIdNum,
        },
      });

      isFollowing = followCount > 0;

      // Verificar si el usuario actual lo tiene bloqueado
      const blockCount = await this.blockRepo.count({
        where: {
          blockerId: userIdNum,
          blockedId: profileIdNum,
        },
      });
      isBlocked = blockCount > 0;
    } else {
      console.log(
        `⚠️ [PUBLIC_PROFILE] Sin autenticación, mismo usuario, o IDs inválidos - isFollowing = false`,
      );
      console.log(
        `   Razón: userIdNum=${userIdNum}, isNaN=${userIdNum ? isNaN(userIdNum) : 'N/A'}, sonIguales=${userIdNum === profileIdNum}`,
      );
    }

    return {
      ...user,
      vehicles,
      followersCount,
      followingCount,
      isFollowing,
      isBlocked,
    };
  }

  async findByEmail(email: string) {
    return this.usersRepository.findOne({
      where: { email },
      select: [
        'id',
        'email',
        'password',
        'role',
        'fullName',
        'fcmToken',
        'providerId',
      ],
    });
  }

  /**
   * Vincula un usuario como staff a un negocio
   */
  async linkToProvider(
    userId: number,
    providerId: number,
    role: 'provider_admin' | 'provider_staff',
  ) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    user.providerId = providerId;
    user.role = role;
    return await this.usersRepository.save(user);
  }

  /**
   * Desvincula un usuario de un negocio (vuelve a ser user normal)
   */
  async unlinkFromProvider(userId: number) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    user.providerId = null;
    user.role = 'user';
    return await this.usersRepository.save(user);
  }

  async updateSessionToken(id: number, token: string) {
    return this.usersRepository.update(id, { currentSessionToken: token });
  }

  /** Actualiza la fecha de último acceso del usuario */
  async updateLastLogin(id: number) {
    return this.usersRepository.update(id, { lastLoginAt: new Date() });
  }

  /** Cambia la visibilidad del usuario en el mapa */
  async setVisibility(id: number, isVisible: boolean) {
    await this.usersRepository.update(id, { isVisible });
    return { isVisible };
  }

  /**
   * Tarea de mantenimiento: oculta automáticamente todos los proveedores
   * que no hayan iniciado sesión en los últimos 14 días.
   * @returns cantidad de proveedores ocultados
   */
  async hideInactiveProviders(): Promise<number> {
    const logger = new Logger('UsersScheduler');
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);

    const result = await this.usersRepository
      .createQueryBuilder()
      .update(User)
      .set({ isVisible: false })
      .where('role IN (:...roles)', {
        roles: ['provider', 'provider_admin', 'provider_staff'],
      })
      .andWhere('last_login_at < :cutoff', { cutoff })
      .andWhere('is_visible = :visible', { visible: true })
      .execute();

    const count = result.affected ?? 0;
    if (count > 0) {
      logger.log(
        `Auto-ocultados ${count} proveedor(es) por inactividad (>14 días).`,
      );
    }
    return count;
  }

  /**
   * Búsqueda ligera para validación de sesión en JwtStrategy.
   * Selecciona explícitamente current_session_token (campo con select:false),
   * además de role y provider_id para que reflejen cambios en tiempo real.
   */
  async findByIdForSession(id: number): Promise<{
    id: number;
    currentSessionToken: string | null;
    role: string;
    providerId: number | null;
    bannedUntil: Date | null;
  } | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .select([
        'user.id',
        'user.currentSessionToken',
        'user.role',
        'user.providerId',
        'user.bannedUntil',
      ])
      .where('user.id = :id', { id })
      .getOne();
  }

  findAll() {
    return this.usersRepository.find();
  }

  async update(id: number, updateUserDto: UpdateUserDto) {
    // 1. Si viene password, hashearlo
    if (updateUserDto.password) {
      const salt = await bcrypt.genSalt();
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, salt);
    }

    // 2. Si viene email, verificar duplicados
    if (updateUserDto.email) {
      const existingUser = await this.usersRepository.findOne({
        where: { email: updateUserDto.email },
      });
      // Si existe y NO es el mismo usuario que está editando
      if (existingUser && existingUser.id !== id) {
        throw new BadRequestException(
          'El email ya está en uso por otro usuario',
        );
      }
    }

    await this.usersRepository.update(id, updateUserDto);
    const user = await this.findOne(id);
    const { password, ...result } = user;
    return result;
  }

  async toggleFollow(followerId: number, followedId: number) {
    if (followerId === followedId) {
      throw new BadRequestException('No puedes seguirte a ti mismo');
    }

    const targetUser = await this.usersRepository.findOne({
      where: { id: followedId },
    });
    if (!targetUser) throw new NotFoundException('Usuario no encontrado');

    const existingFollow = await this.followRepo.findOne({
      where: { followerId, followedId },
    });

    if (existingFollow) {
      await this.followRepo.remove(existingFollow);
      return {
        status: 'unfollowed',
        message: `Dejaste de seguir a ${targetUser.fullName}`,
      };
    } else {
      const newFollow = this.followRepo.create({ followerId, followedId });
      await this.followRepo.save(newFollow);

      // Disparar notificación de follow
      this.notificationTrigger.onFollow(followerId, followedId).catch(() => {});

      return {
        status: 'followed',
        message: `Ahora sigues a ${targetUser.fullName}`,
      };
    }
  }

  /**
   * Obtener la lista de usuarios que este usuario sigue
   */
  async getFollowing(userId: number) {
    const follows = await this.followRepo
      .createQueryBuilder('f')
      .innerJoinAndSelect('f.followed', 'followed')
      .leftJoinAndSelect('followed.provider', 'provider')
      .where('f.followerId = :userId', { userId })
      .andWhere('followed.deletedAt IS NULL')
      .getMany();

    return follows.map((follow) => ({
      id: follow.followed.id,
      fullName: follow.followed.fullName,
      avatarUrl: follow.followed.avatarUrl,
      role: follow.followed.role,
      bio: follow.followed.bio,
      provider: follow.followed.provider
        ? {
            id: follow.followed.provider.id,
            businessName: follow.followed.provider.businessName,
          }
        : null,
    }));
  }

  /**
   * Obtener la lista de usuarios que siguen a este usuario (seguidores)
   */
  async getFollowers(userId: number) {
    const follows = await this.followRepo
      .createQueryBuilder('f')
      .innerJoinAndSelect('f.follower', 'follower')
      .leftJoinAndSelect('follower.provider', 'provider')
      .where('f.followedId = :userId', { userId })
      .andWhere('follower.deletedAt IS NULL')
      .getMany();

    return follows.map((follow) => ({
      id: follow.follower.id,
      fullName: follow.follower.fullName,
      avatarUrl: follow.follower.avatarUrl,
      role: follow.follower.role,
      bio: follow.follower.bio,
      provider: follow.follower.provider
        ? {
            id: follow.follower.provider.id,
            businessName: follow.follower.provider.businessName,
          }
        : null,
    }));
  }

  /**
   * Obtener la lista de usuarios que este usuario ha bloqueado
   */
  async getBlockedUsers(userId: number) {
    if (!userId || isNaN(userId)) {
      throw new BadRequestException('ID de usuario inválido');
    }

    const blocks = await this.blockRepo.find({
      where: { blockerId: userId },
    });

    if (blocks.length === 0) {
      return [];
    }

    // Obtener los IDs de los usuarios bloqueados
    const blockedIds = blocks.map((block) => block.blockedId);

    // Buscar la información de esos usuarios
    const blockedUsers = await this.usersRepository.find({
      where: { id: In(blockedIds) },
      relations: ['provider'],
      select: {
        id: true,
        fullName: true,
        avatarUrl: true,
        role: true,
        bio: true,
        provider: {
          id: true,
          businessName: true,
        },
      },
    });

    return blockedUsers.map((user) => ({
      id: user.id,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      role: user.role,
      bio: user.bio,
      provider: user.provider
        ? {
            id: user.provider.id,
            businessName: user.provider.businessName,
          }
        : null,
    }));
  }

  async searchUsers(query: string, currentUserId?: number, limit: number = 10) {
    const qb = this.usersRepository
      .createQueryBuilder('user')
      .where('user.fullName LIKE :q', { q: `%${query}%` })
      .select(['user.id', 'user.fullName', 'user.avatarUrl', 'user.role', 'user.bio'])
      .take(limit)
      .orderBy('user.fullName', 'ASC');

    // Excluir usuarios con bloqueo bidireccional
    if (currentUserId) {
      qb.andWhere(
        `user.id NOT IN (
          SELECT ub.blocked_id FROM user_blocks ub WHERE ub.blocker_id = :me
          UNION
          SELECT ub.blocker_id FROM user_blocks ub WHERE ub.blocked_id = :me
        )`,
        { me: currentUserId },
      );
    }

    return qb.getMany();
  }
}
