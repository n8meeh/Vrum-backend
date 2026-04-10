import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Provider } from './entities/provider.entity';
import { ProviderService } from './entities/provider-service.entity';
import { CreateProviderServiceDto } from './dto/create-service.dto';
import { User } from '../users/entities/user.entity';
import { UpdateProviderServiceDto } from './dto/update-provider-service.dto';
import { VehicleType } from '../vehicles/entities/vehicle-type.entity';
import { UpdateSpecialtiesDto } from './dto/update-specialties.dto';
import { Specialty } from './entities/specialty.entity';
import { Review } from '../reviews/entities/review.entity';
import { Order } from '../orders/entities/order.entity';
import { Negotiation } from '../negotiations/entities/negotiation.entity';
import { UsersService } from '../users/users.service';
import { MetricsService } from './metrics.service';
import { EmailService } from '../auth/email.service';

interface ValidationResult {
  isValid: boolean;
  reason?: string;
}

@Injectable()
export class ProvidersService {
  private readonly logger = new Logger(ProvidersService.name);

  constructor(
    @InjectRepository(Provider) private providersRepository: Repository<Provider>,
    @InjectRepository(ProviderService) private providerServicesRepo: Repository<ProviderService>,
    @InjectRepository(User) private usersRepo: Repository<User>,
    @InjectRepository(VehicleType) private vehicleTypesRepo: Repository<VehicleType>,
    @InjectRepository(Specialty) private specialtiesRepo: Repository<Specialty>,
    @InjectRepository(Review) private reviewsRepo: Repository<Review>,
    @InjectRepository(Order) private ordersRepo: Repository<Order>,
    @InjectRepository(Negotiation) private negotiationsRepo: Repository<Negotiation>,
    private usersService: UsersService,
    private metricsService: MetricsService,
    private emailService: EmailService,
  ) { }

  /**
   * Job de verificación automática: Se ejecuta cada día a las 3AM.
   * Verifica si proveedores en estado 0 (Nuevo) cumplen los requisitos para pasar a estado 1 (Verificado).
   * Requisitos: 2 meses de antigüedad + 5 chats con clientes distintos + 5 reseñas (promedio 3+).
   */
  @Cron('0 3 * * *', { timeZone: 'America/Santiago' })
  async runVerificationJob() {
    this.logger.log('🔍 Ejecutando job de verificación automática de proveedores...');

    // Obtener proveedores en estado 0 (Nuevo)
    const newProviders = await this.providersRepository.find({
      where: { isVerified: 0, isVisible: true },
      relations: ['user'],
    });

    let verified = 0;

    for (const provider of newProviders) {
      try {
        // 1. Antigüedad: Al menos 2 meses desde la creación del usuario
        const twoMonthsAgo = new Date();
        twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
        if (!provider.user?.createdAt || new Date(provider.user.createdAt) > twoMonthsAgo) {
          continue;
        }

        // 2. Al menos 5 chats con clientes distintos en order_negotiations
        const distinctClients = await this.ordersRepo
          .createQueryBuilder('order')
          .innerJoin('order_negotiations', 'neg', 'neg.order_id = order.id')
          .where('order.providerId = :providerId', { providerId: provider.id })
          .select('COUNT(DISTINCT order.clientId)', 'count')
          .getRawOne();

        if (!distinctClients || parseInt(distinctClients.count) < 5) {
          continue;
        }

        // 3. Al menos 5 reseñas con promedio de 3+ estrellas
        const reviewStats = await this.reviewsRepo
          .createQueryBuilder('review')
          .where('review.providerId = :providerId', { providerId: provider.id })
          .select('COUNT(*)', 'count')
          .addSelect('AVG(review.ratingOverall)', 'avg')
          .getRawOne();

        if (!reviewStats || parseInt(reviewStats.count) < 5 || parseFloat(reviewStats.avg) < 3) {
          continue;
        }

        // ✅ Cumple todos los requisitos → Verificar
        provider.isVerified = 1;
        await this.providersRepository.save(provider);
        verified++;

        this.logger.log(`✅ Proveedor "${provider.businessName}" (ID: ${provider.id}) verificado automáticamente.`);
      } catch (err) {
        this.logger.error(`Error verificando proveedor ${provider.id}: ${err.message}`);
      }
    }

    this.logger.log(`🔍 Job completado. ${verified}/${newProviders.length} proveedores verificados.`);
  }

  // --- GESTIÓN DE TIPOS DE VEHÍCULO ---
  async updateVehicleTypes(userId: number, typeIds: number[]) {
    const found = await this.findOneByUserId(userId);
    if (!found) throw new BadRequestException('No tienes un negocio registrado');

    // Recargar con la relación específica necesaria
    const provider = await this.providersRepository.findOne({
      where: { id: found.id },
      relations: ['vehicleTypes']
    });
    if (!provider) throw new NotFoundException('No se encontró el negocio');

    // Si el array está vacío, borramos todas las relaciones
    if (typeIds.length === 0) {
      provider.vehicleTypes = [];
      return await this.providersRepository.save(provider);
    }

    // Validar que todos los IDs existan
    const types = await this.vehicleTypesRepo.findBy({
      id: In(typeIds)
    });

    if (types.length !== typeIds.length) {
      throw new BadRequestException('Uno o más tipos de vehículo seleccionados no son válidos');
    }

    // Sync: Reemplazar la lista actual con la nueva
    provider.vehicleTypes = types;
    return await this.providersRepository.save(provider);
  }

  // --- TALLER ---
  async update(userId: number, dto: UpdateProviderDto) {
    const provider = await this.findOneByUserId(userId);
    if (!provider) throw new BadRequestException('No tienes un negocio registrado');

    // Actualizamos todos los campos del DTO
    Object.assign(provider, dto);

    // 🛡️ GATEKEEPER: Validación de Visibilidad
    const validation = this.validateProfileCompleteness(provider);

    // Caso A: Intento explícito de activar visibilidad sin cumplir requisitos
    if (dto.isVisible === true && !validation.isValid) {
      throw new BadRequestException(validation.reason);
    }

    // Caso B: Sincronización - Si pierde requisitos, forzamos isVisible a false
    if (provider.isVisible && !validation.isValid) {
      provider.isVisible = false;
    }

    const savedProvider = await this.providersRepository.save(provider);

    // 🧹 LIMPIEZA: Quitamos el usuario de la respuesta
    // Usamos (savedProvider as any) para evitar el error TS2790
    if (savedProvider.user) {
      delete (savedProvider as any).user;
    }

    return savedProvider;
  }

  async deleteProvider(userId: number) {
    const provider = await this.findOneByUserId(userId);
    if (!provider) throw new BadRequestException('No tienes un negocio registrado');

    // 1. Lo ocultamos del mapa
    await this.providersRepository.update(provider.id, { isVisible: false });

    // 2. Desvincular staff: cambiar rol a 'user' y quitar providerId
    const staffMembers = await this.usersRepo.find({
      where: { providerId: provider.id },
    });
    for (const staff of staffMembers) {
      staff.role = 'user';
      staff.providerId = null;
    }
    if (staffMembers.length > 0) {
      await this.usersRepo.save(staffMembers);
    }

    // 3. Cambiar rol del dueño a 'user'
    await this.usersService.updateRole(userId, 'user');

    // 4. Ejecutamos el Soft Delete
    await this.providersRepository.softDelete(provider.id);

    // 📧 Enviar correo de cierre del negocio
    try {
      const user = await this.usersRepo.findOne({ where: { id: userId } });
      if (user?.email) {
        await this.emailService.sendProviderClosedEmail(
          user.email,
          provider.businessName || 'tu negocio',
        );
      }
    } catch (err) {
      this.logger.error(`No se pudo enviar correo de cierre de negocio: ${err.message}`);
    }

    return { message: 'Taller cerrado correctamente. Historial preservado.' };
  }

  // 🆕 Actualizar todas las especialidades en un solo endpoint
  async updateSpecialties(userId: number, dto: UpdateSpecialtiesDto) {
    const found = await this.findOneByUserId(userId);
    if (!found) throw new BadRequestException('No tienes un negocio registrado');

    const provider = await this.providersRepository.findOne({
      where: { id: found.id },
      relations: ['vehicleTypes', 'specialties']
    });
    if (!provider) throw new NotFoundException('No se encontró el negocio');

    // 🆕 SISTEMA JERÁRQUICO: Actualizar especialidades
    if (dto.specialtyIds !== undefined) {
      if (dto.specialtyIds.length === 0) {
        provider.specialties = [];
      } else {
        const specialties = await this.specialtiesRepo.findBy({
          id: In(dto.specialtyIds)
        });

        if (specialties.length !== dto.specialtyIds.length) {
          throw new BadRequestException('Una o más especialidades seleccionadas no son válidas');
        }

        provider.specialties = specialties;
      }
    }

    // 🎨 MULTIMARCA: Manejar lógica de multimarca
    if (dto.isMultibrand !== undefined) {
      if (dto.isMultibrand === true) {
        provider.specialtyBrands = [];
        provider.isMultibrand = true;
      } else {
        provider.isMultibrand = false;

        if (dto.brandNames !== undefined) {
          if (dto.brandNames.length === 0) {
            throw new BadRequestException('Debes especificar al menos una marca si no eres multimarca');
          }
          provider.specialtyBrands = dto.brandNames;
        }
      }
    } else if (dto.brandNames !== undefined) {
      provider.specialtyBrands = dto.brandNames;
      if (dto.brandNames.length > 0) provider.isMultibrand = false;
    }

    // 🚗 Actualizar tipos de vehículos
    if (dto.vehicleTypeIds !== undefined) {
      const types = await this.vehicleTypesRepo.findBy({
        id: In(dto.vehicleTypeIds)
      });

      if (types.length !== dto.vehicleTypeIds.length) {
        throw new BadRequestException('Uno o más tipos de vehículo seleccionados no son válidos');
      }

      provider.vehicleTypes = types;
    }

    // 🛡️ GATEKEEPER: Sincronización de visibilidad
    const validation = this.validateProfileCompleteness(provider);
    if (provider.isVisible && !validation.isValid) {
      provider.isVisible = false;
    }

    return await this.providersRepository.save(provider);
  }

  async create(userId: number, createProviderDto: CreateProviderDto) {
    let savedProvider: Provider;

    // 1. Buscamos si ya existe (incluso si está borrado "soft-delete")
    const existingProvider = await this.providersRepository.findOne({
      where: { userId },
      withDeleted: true,
    });

    if (existingProvider) {
      // SI YA EXISTE (Activo o Borrado):

      // A) Restauramos (quita la fecha de borrado si la tenía)
      if (existingProvider.deletedAt) {
        await this.providersRepository.restore(existingProvider.id);
        existingProvider.deletedAt = null; // Actualizamos en memoria
      }

      // B) Aseguramos que sea visible
      existingProvider.isVisible = true;

      // C) Actualizamos los datos viejos con los nuevos
      const providerToUpdate = this.providersRepository.merge(existingProvider, createProviderDto);

      // D) Guardamos los cambios
      savedProvider = await this.providersRepository.save(providerToUpdate);
    } else {
      // 2. SI NO EXISTE: Creamos uno nuevo desde cero
      const newProvider = this.providersRepository.create({
        ...createProviderDto,
        userId: userId,
        isVisible: true,
      });

      savedProvider = await this.providersRepository.save(newProvider);
    }

    // 🛡️ GATEKEEPER POST-SAVE: Validar si puede ser visible inicialmente
    // Recargamos el provider con sus relaciones (especialmente specialties) para validar
    const fullProvider = await this.providersRepository.findOne({
      where: { id: savedProvider.id },
      relations: ['specialties']
    });

    if (fullProvider && fullProvider.isVisible) {
      const validation = this.validateProfileCompleteness(fullProvider);
      if (!validation.isValid) {
        await this.providersRepository.update(fullProvider.id, { isVisible: false });
        savedProvider.isVisible = false;
      }
    }

    // 🆕 LÓGICA DE ASCENSO: Actualizar rol del usuario a 'provider'
    await this.usersService.updateRole(userId, 'provider');

    // 📧 Enviar correo de bienvenida al proveedor
    try {
      const user = await this.usersRepo.findOne({ where: { id: userId } });
      if (user?.email) {
        await this.emailService.sendProviderWelcomeEmail(
          user.email,
          savedProvider.businessName || 'tu negocio',
        );
      }
    } catch (err) {
      this.logger.error(`No se pudo enviar correo de bienvenida al proveedor: ${err.message}`);
    }

    // 🧹 LIMPIEZA: Quitamos el usuario de la respuesta para seguridad
    // Usamos (savedProvider as any) para evitar el error TS2790
    if (savedProvider.user) {
      delete (savedProvider as any).user;
    }

    return savedProvider;
  }

  findAll() {
    return this.providersRepository
      .createQueryBuilder('provider')
      .innerJoin('provider.user', 'user')
      .where('user.isVisible = :visible', { visible: true })
      .andWhere('user.deletedAt IS NULL')
      .getMany();
  }

  async findOne(id: number) {
    const provider = await this.providersRepository
      .createQueryBuilder('provider')
      .leftJoinAndSelect('provider.user', 'user')
      .leftJoinAndSelect('provider.services', 'services')
      .leftJoinAndSelect('services.vehicleType', 'vehicleType')
      .leftJoinAndSelect('provider.products', 'products', 'products.is_active = :prodActive', { prodActive: true })
      .leftJoinAndSelect('products.category', 'productCategory')
      .leftJoinAndSelect('products.vehicleType', 'productVehicleType')
      .leftJoinAndSelect('provider.vehicleTypes', 'vehicleTypes')
      .leftJoinAndSelect('provider.specialties', 'specialties')
      .leftJoinAndSelect('specialties.category', 'category')
      .loadRelationCountAndMap('provider.reviewsCount', 'provider.reviews')
      .where('provider.id = :id', { id })
      .getOne();

    // Soft-limit: si no es premium, mostrar solo los primeros N
    if (provider && !provider.isPremium) {
      if (provider.services?.length > 7) {
        provider.services = provider.services.slice(0, 7);
      }
      if (provider.products?.length > 10) {
        provider.products = provider.products.slice(0, 10);
      }
    }

    return provider;
  }

  async findClosedByUserId(userId: number) {
    if (!userId) return null;
    const provider = await this.providersRepository.findOne({
      where: { userId },
      withDeleted: true,
    });
    // Solo devolver si está soft-deleted
    if (provider && provider.deletedAt) {
      return provider;
    }
    return null;
  }

  async findOneByUserId(userId: number) {
    if (!userId) return null;

    // 1. Buscar como dueño directo
    let provider = await this.providersRepository.findOne({
      where: { userId },
      relations: [
        'user',
        'services',
        'services.vehicleType',
        'products',
        'products.category',
        'products.vehicleType',
        'vehicleTypes',
        'specialties',
        'specialties.category'
      ],
      order: {
        services: {
          id: 'DESC'
        },
      }
    });

    // 2. Si no es dueño, buscar como staff
    if (!provider) {
      const user = await this.usersRepo.findOne({ where: { id: userId } });
      if (user?.providerId) {
        provider = await this.providersRepository.findOne({
          where: { id: user.providerId },
          relations: [
            'user',
            'services',
            'services.vehicleType',
            'vehicleTypes',
            'specialties',
            'specialties.category'
          ],
          order: {
            services: {
              id: 'DESC'
            },
          }
        });
      }
    }

    return provider || null;
  }

  /**
   * Resuelve el provider para un usuario (dueño o staff), versión ligera.
   */
  async resolveProviderForUser(userId: number): Promise<Provider | null> {
    const asOwner = await this.providersRepository.findOne({ where: { userId } });
    if (asOwner) return asOwner;

    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (user?.providerId) {
      return this.providersRepository.findOne({ where: { id: user.providerId } });
    }
    return null;
  }

  async findNearby(lat: number, lng: number, radius: number) {
    const query = this.providersRepository
      .createQueryBuilder('provider')
      .leftJoinAndSelect('provider.specialties', 'specialties')
      .leftJoinAndSelect('specialties.category', 'category')
      .leftJoinAndSelect('provider.vehicleTypes', 'vehicleTypes')
      .leftJoinAndSelect('provider.services', 'services')
      .leftJoinAndSelect('provider.products', 'products')
      .leftJoinAndSelect('provider.user', 'user')
      .addSelect(
        `(6371 * acos(cos(radians(:lat)) * cos(radians(provider.lat)) * cos(radians(provider.lng) - radians(:lng)) + sin(radians(:lat)) * sin(radians(provider.lat))))`,
        'distance'
      )
      .where('provider.lat IS NOT NULL')
      .andWhere('provider.lng IS NOT NULL')
      // Filtramos solo los visibles (No mostramos los que están de vacaciones)
      .andWhere('provider.isVisible = :visible', { visible: true })
      // Solo usuarios activos y no eliminados
      .andWhere('user.isVisible = :userVisible', { userVisible: true })
      .andWhere('user.deletedAt IS NULL');

    const results = await query
      .having('distance <= :radius')
      .orderBy('distance', 'ASC')
      .setParameters({ lat, lng, radius })
      .getMany();

    // Soft-limit: no-premium solo muestra primeros 7 servicios y 10 productos
    for (const p of results) {
      if (!p.isPremium) {
        if (p.services?.length > 7) p.services = p.services.slice(0, 7);
        if (p.products?.length > 10) p.products = p.products.slice(0, 10);
      }
    }

    return results;
  }

  // --- SERVICIOS ---
  async addService(userId: number, dto: CreateProviderServiceDto) {
    const provider = await this.findOneByUserId(userId);
    if (!provider) throw new BadRequestException('No tienes un negocio registrado');

    // Límite de 7 servicios para proveedores no-premium
    if (!provider.isPremium) {
      const servicesCount = await this.providerServicesRepo.count({
        where: { providerId: provider.id },
      });
      if (servicesCount >= 7) {
        throw new ForbiddenException('Has alcanzado tu límite de 7 servicios. ¡Pásate a Premium para agregar servicios sin límites!');
      }
    }

    const newService = this.providerServicesRepo.create({
      providerId: provider.id,
      ...dto
    });
    return await this.providerServicesRepo.save(newService);
  }

  async getMyServices(userId: number) {
    const provider = await this.findOneByUserId(userId);
    if (!provider) throw new BadRequestException('No tienes un negocio registrado');
    return this.providerServicesRepo.find({
      where: { providerId: provider.id },
      relations: ['vehicleType']
    });
  }

  async updateService(userId: number, serviceId: number, dto: UpdateProviderServiceDto) {
    const provider = await this.findOneByUserId(userId);
    if (!provider) throw new BadRequestException('No tienes un negocio registrado');
    const service = await this.providerServicesRepo.findOne({
      where: { id: serviceId, providerId: provider.id }
    });
    if (!service) throw new NotFoundException('El servicio que intentas modificar no existe');

    Object.assign(service, dto);
    return await this.providerServicesRepo.save(service);
  }

  async deleteService(userId: number, serviceId: number) {
    const provider = await this.findOneByUserId(userId);
    if (!provider) throw new BadRequestException('No tienes un negocio registrado');
    const service = await this.providerServicesRepo.findOne({
      where: { id: serviceId, providerId: provider.id }
    });
    if (!service) throw new NotFoundException('El servicio que intentas modificar no existe');

    await this.providerServicesRepo.remove(service);
    return { message: 'Servicio eliminado' };
  }

  // Interruptor de "Vacaciones" (Ocultar/Mostrar en mapa)
  async toggleVisibility(userId: number) {
    const provider = await this.findOneByUserId(userId);
    if (!provider) throw new BadRequestException('No tienes un negocio registrado');

    const nextVisibility = !provider.isVisible;

    // 🛡️ GATEKEEPER: Validar si intenta activar
    if (nextVisibility === true) {
      const validation = this.validateProfileCompleteness(provider);
      if (!validation.isValid) {
        throw new BadRequestException(validation.reason);
      }
    }

    provider.isVisible = nextVisibility;
    await this.providersRepository.save(provider);

    return {
      message: provider.isVisible ? 'Tu taller ahora es visible en el mapa 🟢' : 'Tu taller está oculto (Modo Vacaciones) 🔴',
      isVisible: provider.isVisible
    };
  }

  /**
   * 🛡️ Gatekeeper de Visibilidad
   * Valida que el negocio tenga información de contacto y especialidades antes de ser público.
   */
  private validateProfileCompleteness(provider: Provider): ValidationResult {
    // 1. Validar Contactos
    const contacts = provider.contacts;
    let hasValidContact = false;

    if (contacts) {
      const contactValues = [
        contacts.whatsapp,
        contacts.instagram,
        contacts.facebook,
        contacts.tiktok,
        contacts.website,
        contacts.phone,
      ];

      hasValidContact = contactValues.some((v) => {
        if (!v) return false;
        const val = String(v).trim();
        // No vacío y no solo el prefijo por defecto
        return val !== '' && val !== '+569' && val !== '+56';
      });
    }

    // 2. Validar Especialidades
    const hasSpecialties =
      (provider.specialties && provider.specialties.length > 0) ||
      (provider.specialtyBrands && provider.specialtyBrands.length > 0) ||
      provider.isMultibrand === true;

    if (!hasValidContact || !hasSpecialties) {
      return {
        isValid: false,
        reason: 'Debes registrar métodos de contacto y especialidades para activar la visibilidad',
      };
    }

    return { isValid: true };
  }

  // --- MÉTRICAS DE NEGOCIO ---
  async getMyMetrics(userId: number) {
    const provider = await this.findOneByUserId(userId);
    if (!provider) throw new BadRequestException('No tienes un negocio registrado');

    const stats = await this.metricsService.getAggregated(provider.id);
    const conversionRate = stats.profileViews > 0
      ? Math.round((stats.totalClicks / stats.profileViews) * 100 * 10) / 10
      : 0;

    return {
      ...stats,
      conversionRate,
      ratingAvg: Number(provider.ratingAvg) || 0,
      reviewCount: (provider as any).reviewsCount ?? 0,
    };
  }

  async trackProfileView(providerId: number): Promise<void> {
    await this.metricsService.track(providerId, 'profile_views');
  }
}