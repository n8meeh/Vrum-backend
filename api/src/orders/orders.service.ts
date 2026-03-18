import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm'; // Agregué Not e IsNull por si acaso
import { Negotiation } from '../negotiations/entities/negotiation.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { PostsService } from '../posts/posts.service';
import { Provider } from '../providers/entities/provider.entity';
import { VehicleEventsService } from '../vehicle-events/vehicle-events.service';
import { User } from '../users/entities/user.entity';
import { VehicleMileageLog } from '../vehicles/entities/vehicle-mileage-log.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { Order } from './entities/order.entity';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private ordersRepository: Repository<Order>,
    @InjectRepository(Negotiation) private negotiationsRepository: Repository<Negotiation>,
    @InjectRepository(Provider) private providersRepository: Repository<Provider>,
    @InjectRepository(Vehicle) private vehiclesRepository: Repository<Vehicle>,
    @InjectRepository(VehicleMileageLog) private mileageLogRepo: Repository<VehicleMileageLog>,
    @InjectRepository(User) private usersRepo: Repository<User>,
    private postsService: PostsService,
    private notificationsService: NotificationsService,
    private vehicleEventsService: VehicleEventsService,
  ) { }

  /**
   * Resuelve el provider para un usuario (dueño o staff).
   */
  private async resolveProviderForUser(userId: number): Promise<Provider | null> {
    // 1. Como dueño
    const asOwner = await this.providersRepository.findOne({ where: { userId } });
    if (asOwner) return asOwner;

    // 2. Como staff
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (user?.providerId) {
      return this.providersRepository.findOne({ where: { id: user.providerId } });
    }

    return null;
  }

  // 1. PROPUESTA (Provider ofrece servicio a un Post)
  async createProposal(userId: number, dto: CreateProposalDto) {

    // 🔍 1. Obtenemos el Provider (como dueño o staff)
    const provider = await this.resolveProviderForUser(userId);

    if (!provider) throw new UnauthorizedException('Necesitas tener un negocio registrado para enviar propuestas');

    // 🛑 2. Validación Freemium (Límite 2 propuestas/mes)
    if (!provider.isPremium) {
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const proposalsCount = await this.ordersRepository.count({
        where: {
          provider: { id: provider.id }, // Usamos la relación para ser más seguros
          isProposal: true,              // Ahora sí existe gracias al Paso 1
          createdAt: MoreThan(firstDayOfMonth)
        }
      });

      if (proposalsCount >= 2) {
        throw new ForbiddenException('Solo puedes enviar 2 propuestas mensuales en el plan gratuito.');
      }
    }

    // 3. Validar el Post
    const post = await this.postsService.findOne(dto.postId);
    if (!post) throw new NotFoundException('La publicación ya no existe o fue eliminada');

    // 3.1. Bloquear propuestas en hilos resueltos
    if ((post as any).isSolved) {
      throw new ForbiddenException('Este hilo ya ha sido resuelto y no acepta nuevas propuestas.');
    }

    // (Eliminé la segunda búsqueda de provider aquí porque ya la hicimos arriba)

    if (post.authorId === userId) throw new BadRequestException('No puedes enviar una propuesta a tu propia publicación');

    // 🔴 3.5. Evitar Duplicados: Verificar si ya existe una propuesta de este proveedor para este post
    const existingProposal = await this.ordersRepository.findOne({
      where: {
        provider: { id: provider.id },
        post: { id: dto.postId },
        // isProposal: true // Opcional, pero redundante si asumimos que cualquier relación provider-post aquí es una orden/propuesta
      }
    });

    if (existingProposal) {
      // Opcional: Permitir si la anterior fue cancelada o rechazada, pero por ahora bloqueamos todo.
      throw new ConflictException('Ya has enviado una propuesta para esta publicación.');
    }

    // 4. Obtener vehículo (puede ser nulo si el post no tiene vehículo asociado)
    const vehicleId = post.vehicleId || (post.vehicle ? post.vehicle.id : null);

    // Nota: Eliminamos el check restrictivo porque el provider puede ofrecer servicio general

    // 5. Crear la Orden (Marcada como Propuesta)
    const newOrder = this.ordersRepository.create({
      client: { id: post.authorId },
      provider: { id: provider.id },
      post: { id: post.id },
      vehicle: vehicleId ? { id: vehicleId } : undefined,
      status: 'pending',
      isProposal: true, // 👈 ¡IMPORTANTE! Marcamos que es una propuesta
      // 👇 MEJORA: Heredar datos para que no sea una orden "fantasma"
      title: (post as any).title || (post.content ? post.content.substring(0, 50) : 'Propuesta de Servicio'), // Fallback seguro
      description: `Propuesta de servicio para tu ${post.vehicle ? (post.vehicle.alias || `${post.vehicle.brand} ${post.vehicle.model}`.trim() || 'vehículo') : 'publicación'}`,
      isHomeService: (post as any).isHomeService || false,
    });

    const savedOrder = await this.ordersRepository.save(newOrder);

    // 5. Crear la Negociación Inicial
    const initialNegotiation = this.negotiationsRepository.create({
      orderId: savedOrder.id,
      authorId: userId,
      message: dto.message,
      proposedPrice: dto.price
    });

    await this.negotiationsRepository.save(initialNegotiation);

    // 👇 MEJORA: Devolver la orden directa para que el front pueda hacer: const order = res.data; navigator.push(order.id)
    return savedOrder;
  }

  // 2. SOLICITUD (Cliente pide hora directamente al Taller)
  async create(userId: number, dto: CreateOrderDto) {
    // Validar vehículo solo si se envía (servicios lo requieren, productos no)
    if (dto.vehicleId) {
      const vehicle = await this.vehiclesRepository.findOne({
        where: { id: dto.vehicleId }
      });

      if (!vehicle) throw new NotFoundException('Vehículo no encontrado');
      if (vehicle.userId !== userId) throw new BadRequestException('El vehículo no te pertenece');
    }

    const newOrder = this.ordersRepository.create({
      client: { id: userId },
      provider: { id: dto.providerId },
      vehicle: dto.vehicleId ? { id: dto.vehicleId } : undefined,
      product: dto.productId ? { id: dto.productId } as any : undefined,
      title: dto.title || 'Solicitud de Servicio',
      description: dto.description,
      status: 'pending',
      isHomeService: dto.isHomeService ?? false,
      scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : undefined,
      isProposal: false,
    });

    return await this.ordersRepository.save(newOrder);
  }

  // ... (Resto de métodos iguales) ...

  findAllByClient(clientId: number) {
    return this.ordersRepository.find({
      where: { client: { id: clientId } },
      relations: ['provider', 'vehicle', 'post'],
      order: { createdAt: 'DESC' }
    });
  }

  async getMyOrders(userId: number, role: string) {
    if (role === 'client' || role === 'user') {
      return this.ordersRepository
        .createQueryBuilder('order')
        .leftJoinAndSelect('order.provider', 'provider')
        .leftJoinAndSelect('order.vehicle', 'vehicle')
        .leftJoinAndSelect('order.post', 'post')
        .leftJoin(
          (qb) =>
            qb
              .select('n.order_id', 'order_id')
              .addSelect('MAX(n.created_at)', 'last_activity')
              .from('order_negotiations', 'n')
              .groupBy('n.order_id'),
          'last_msg',
          'last_msg.order_id = order.id',
        )
        .where('order.client_id = :userId', { userId })
        .orderBy('COALESCE(last_msg.last_activity, order.created_at)', 'DESC')
        .getMany();
    }

    // provider, provider_admin, provider_staff — todos ven las órdenes del negocio
    if (['provider', 'provider_admin', 'provider_staff'].includes(role)) {
      const provider = await this.resolveProviderForUser(userId);
      if (!provider) return [];

      return this.ordersRepository
        .createQueryBuilder('order')
        .leftJoinAndSelect('order.client', 'client')
        .leftJoinAndSelect('order.vehicle', 'vehicle')
        .leftJoinAndSelect('order.post', 'post')
        .leftJoin(
          (qb) =>
            qb
              .select('n.order_id', 'order_id')
              .addSelect('MAX(n.created_at)', 'last_activity')
              .from('order_negotiations', 'n')
              .groupBy('n.order_id'),
          'last_msg',
          'last_msg.order_id = order.id',
        )
        .where('order.provider_id = :providerId', { providerId: provider.id })
        .orderBy('COALESCE(last_msg.last_activity, order.created_at)', 'DESC')
        .getMany();
    }

    return [];
  }

  async update(id: number, userId: number, updateOrderDto: UpdateOrderDto) {
    // 1. Buscar la orden completa con relaciones
    const order = await this.ordersRepository.findOne({
      where: { id },
      relations: ['provider', 'provider.user', 'client']
    });

    if (!order) {
      throw new NotFoundException('La orden no fue encontrada');
    }

    // 2. Si se está actualizando el estado, aplicar máquina de estados
    if (updateOrderDto.status) {
      const newStatus = updateOrderDto.status;
      const currentStatus = order.status;

      // Helper: verificar si el userId es staff del provider de esta orden
      const isStaffOfProvider = async () => {
        const user = await this.usersRepo.findOne({ where: { id: userId } });
        if (!user) return false;
        if (['provider_admin', 'provider_staff'].includes(user.role) && user.providerId === order.provider?.id) {
          return true;
        }
        return false;
      };

      // Validar transición: pending -> accepted (solo proveedor o staff)
      if (currentStatus === 'pending' && newStatus === 'accepted') {
        const isOwner = userId === order.providerId;
        const isStaff = await isStaffOfProvider();
        if (!isOwner && !isStaff) {
          throw new ForbiddenException('Solo el proveedor o su equipo pueden aceptar esta orden');
        }
      }

      // Validar transición: accepted -> in_progress (solo proveedor o staff)
      else if (currentStatus === 'accepted' && newStatus === 'in_progress') {
        const isOwner = userId === order.providerId;
        const isStaff = await isStaffOfProvider();
        if (!isOwner && !isStaff) {
          throw new ForbiddenException('Solo el proveedor o su equipo pueden iniciar el trabajo');
        }
      }

      // Validar transición: accepted/in_progress -> completed (cliente, proveedor o staff)
      else if ((currentStatus === 'accepted' || currentStatus === 'in_progress') && newStatus === 'completed') {
        const isOwner = userId === order.providerId;
        const isClient = userId === order.clientId;
        const isStaff = await isStaffOfProvider();
        if (!isClient && !isOwner && !isStaff) {
          throw new ForbiddenException('No tienes permiso para finalizar esta orden');
        }
        // Actualizar fecha de completado
        updateOrderDto['completedAt'] = new Date();

        // Si se informa el kilometraje al completar, validar y registrar
        if (updateOrderDto.currentMileage && order.vehicleId) {
          const vehicle = await this.vehiclesRepository.findOne({ where: { id: order.vehicleId } });
          if (vehicle) {
            if (updateOrderDto.currentMileage < vehicle.lastMileage) {
              throw new BadRequestException(
                `El kilometraje no puede ser menor al registrado: ${vehicle.lastMileage} km`
              );
            }
            await this.vehiclesRepository.update(order.vehicleId, { lastMileage: updateOrderDto.currentMileage });
            await this.mileageLogRepo.save(
              this.mileageLogRepo.create({
                vehicleId: order.vehicleId,
                mileage: updateOrderDto.currentMileage,
                source: 'order_completion',
              })
            );
          }
        }

        // Auto-crear evento en bitácora del vehículo
        if (order.vehicleId) {
          const provName = order.provider?.businessName || 'Taller';
          await this.vehicleEventsService.createFromOrder({
            vehicleId: order.vehicleId,
            userId: order.clientId,
            orderId: order.id,
            title: order.title || `Servicio en ${provName}`,
            description: order.description || undefined,
            cost: order.finalPrice ? Number(order.finalPrice) : undefined,
            mileage: updateOrderDto.currentMileage || undefined,
            type: 'repair',
          });
        }

      }

      // Validar transición: cualquier estado -> cancelled
      else if (newStatus === 'cancelled') {
        // Ambas partes (o staff) pueden cancelar
        const isOwner = userId === order.providerId;
        const isClient = userId === order.clientId;
        const isStaff = await isStaffOfProvider();
        if (!isClient && !isOwner && !isStaff) {
          throw new ForbiddenException('No tienes permiso para cancelar esta orden');
        }
      }

      // Transición no válida
      else if (currentStatus !== newStatus) {
        throw new BadRequestException(
          'No se puede cambiar el estado de la orden en este momento'
        );
      }
    }

    // 3. Actualizar la orden (excluir currentMileage que no es columna de orders)
    const { currentMileage, ...orderData } = updateOrderDto;
    await this.ordersRepository.update(id, orderData);

    // 4. Push notifications según cambio de estado
    const providerName = order.provider?.businessName || 'El proveedor';

    if (updateOrderDto.status === 'accepted' && order.client?.fcmToken) {
      await this.notificationsService.sendPushNotification(
        order.client.fcmToken,
        '¡Tu solicitud fue aceptada!',
        `${providerName} ha aceptado tu orden de servicio.`,
        { orderId: String(id), screen: 'orders' },
      );
    }

    if (updateOrderDto.status === 'in_progress' && order.client?.fcmToken) {
      await this.notificationsService.sendPushNotification(
        order.client.fcmToken,
        'Trabajo iniciado',
        `${providerName} ha comenzado a trabajar en tu orden.`,
        { orderId: String(id), screen: 'orders' },
      );
    }

    if (updateOrderDto.status === 'cancelled') {
      // Notificar a la otra parte
      const isClient = userId === order.clientId;
      const targetToken = isClient ? order.provider?.user?.fcmToken : order.client?.fcmToken;
      const cancellerName = isClient ? 'El cliente' : providerName;
      if (targetToken) {
        await this.notificationsService.sendPushNotification(
          targetToken,
          'Orden cancelada',
          `${cancellerName} ha cancelado la orden.`,
          { orderId: String(id), screen: 'orders' },
        );
      }
    }

    return this.findOne(id);
  }

  async findOne(id: number) {
    return this.ordersRepository.findOne({
      where: { id },
      relations: [
        'provider',
        'client',
        'vehicle',
        'vehicle.vehicleType',
        'post',
        'review',
        'product',
        'product.category',
        'product.vehicleType',
      ],
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        finalPrice: true,
        createdAt: true,
        completedAt: true,

        // 👇 AGREGAMOS ESTOS DOS CAMPOS FALTANTES
        isHomeService: true,
        scheduledDate: true,
        isProposal: true,

        // Provider limpio
        provider: {
          id: true,
          userId: true,
          businessName: true,
          logoUrl: true,
          isHomeService: true, // (Opcional: este es el "capability" del provider)
          contacts: {
            phone: true,
            whatsapp: true
          }
        },
        // Client limpio
        client: {
          id: true,
          fullName: true,
          avatarUrl: true,
        },
        // Vehicle completo
        vehicle: {
          id: true,
          alias: true,
          plate: true,
          year: true,
          brand: true,
          model: true,
          lastMileage: true,
          fuelType: true,
          transmission: true,
          engineSize: true,
          vehicleType: {
            id: true,
            name: true,
          }
        },
        review: true,
        product: {
          id: true,
          name: true,
          description: true,
          brand: true,
          partNumber: true,
          condition: true,
          price: true,
          stock: true,
          imageUrl: true,
          category: { id: true, name: true },
          vehicleType: { id: true, name: true },
        },
      }
    });
  }
}