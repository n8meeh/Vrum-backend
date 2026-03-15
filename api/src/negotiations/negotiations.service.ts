import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Negotiation } from './entities/negotiation.entity';
import { ChatRead } from './entities/chat-read.entity';
import { Order } from '../orders/entities/order.entity';
import { User } from '../users/entities/user.entity';
import { CreateMessageDto } from './dto/create-message.dto';
import { NegotiationsGateway } from './negotiations.gateway';
import { NotificationTriggerService } from '../notifications/notification-trigger.service';

@Injectable()
export class NegotiationsService {
  constructor(
    @InjectRepository(Negotiation) private negotiationsRepository: Repository<Negotiation>,
    @InjectRepository(ChatRead) private chatReadRepository: Repository<ChatRead>,
    @InjectRepository(Order) private ordersRepository: Repository<Order>,
    @InjectRepository(User) private usersRepository: Repository<User>,
    @Inject(forwardRef(() => NegotiationsGateway)) private gateway: NegotiationsGateway,
    private notificationTrigger: NotificationTriggerService,
  ) { }

  /**
   * Verifica si un usuario es participante de la orden (cliente, dueño o staff del negocio)
   */
  private async isOrderParticipant(userId: number, order: Order): Promise<boolean> {
    // Es cliente
    if (order.clientId === userId) return true;
    // Es dueño del negocio
    if (order.provider && order.provider.userId === userId) return true;
    // Es staff del negocio
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (user?.providerId && order.provider && user.providerId === order.provider.id) return true;
    return false;
  }

  // 1. ENVIAR MENSAJE
  async sendMessage(userId: number, dto: CreateMessageDto) {
    const order = await this.ordersRepository.findOne({
      where: { id: dto.orderId },
      relations: ['provider', 'provider.user', 'client']
    });

    if (!order) throw new NotFoundException('La orden no fue encontrada');

    const canAccess = await this.isOrderParticipant(userId, order);
    if (!canAccess) throw new ForbiddenException('No tienes acceso a esta conversación');

    const newMessage = this.negotiationsRepository.create({
      orderId: dto.orderId,
      authorId: userId,
      message: dto.message,
      proposedPrice: dto.proposedPrice || undefined,
      proposedDate: dto.proposedDate ? new Date(dto.proposedDate) : undefined,
      proposedIsHomeService: dto.proposedIsHomeService,
    });

    const saved = await this.negotiationsRepository.save(newMessage);

    // Cargar con autor para emitir objeto completo por WebSocket
    const savedWithAuthor = await this.negotiationsRepository.findOne({
      where: { id: saved.id },
      relations: ['author'],
      select: {
        id: true,
        message: true,
        proposedPrice: true,
        createdAt: true,
        author: { id: true, fullName: true, avatarUrl: true, role: true },
      },
    });

    // Emitir en tiempo real a todos los participantes de la orden
    this.gateway.emitNewMessage(dto.orderId, savedWithAuthor);

    // Notificar al otro participante (push + in-app)
    const senderName = savedWithAuthor?.author?.fullName || 'Alguien';
    const recipientIds: number[] = [];

    // Si el que envía es el cliente, notificar al dueño del negocio
    // Si el que envía es del negocio, notificar al cliente
    if (order.clientId !== userId) {
      recipientIds.push(order.clientId);
    }
    if (order.provider?.userId && order.provider.userId !== userId) {
      recipientIds.push(order.provider.userId);
    }

    for (const recipientId of recipientIds) {
      this.notificationTrigger.onChatMessage(userId, senderName, recipientId, dto.orderId).catch(() => {});
    }

    return savedWithAuthor;
  }

  // 2. VER HISTORIAL
  async getChatHistory(userId: number, orderId: number) {
    const order = await this.ordersRepository.findOne({
      where: { id: orderId },
      relations: ['provider', 'provider.user'],
    });
    if (!order) throw new NotFoundException('La orden no fue encontrada');

    const canAccess = await this.isOrderParticipant(userId, order);
    if (!canAccess) throw new ForbiddenException('No tienes acceso a esta conversación');

    // Ahora buscamos los mensajes con el filtro SELECT
    return this.negotiationsRepository.find({
      where: { orderId },
      relations: ['author'],
      select: {
        id: true,
        message: true,
        proposedPrice: true,
        createdAt: true,
        author: {
          id: true,
          fullName: true,
          avatarUrl: true,
          role: true
        }
      },
      order: { createdAt: 'ASC' }
    });
  }

  // 3. ACEPTAR OFERTA
  async acceptOffer(negotiationId: number, userId: number) {
    const negotiation = await this.negotiationsRepository.findOne({ where: { id: negotiationId }, relations: ['order'] });
    if (!negotiation) throw new BadRequestException('La propuesta ya no está disponible');

    if (negotiation.authorId === userId) {
      throw new BadRequestException('No puedes aceptar tu propia oferta');
    }

    negotiation.order.status = 'accepted';
    negotiation.order.finalPrice = negotiation.proposedPrice;
    
    // Actualizar fecha si fue propuesta en la negociación
    if (negotiation.proposedDate) {
      negotiation.order.scheduledDate = negotiation.proposedDate;
    }
    
    // Actualizar servicio a domicilio si fue propuesto en la negociación
    if (negotiation.proposedIsHomeService !== undefined && negotiation.proposedIsHomeService !== null) {
      negotiation.order.isHomeService = negotiation.proposedIsHomeService;
    }
    
    return await this.ordersRepository.save(negotiation.order);
  }

  // 4. MARCAR CHAT COMO LEÍDO
  async markChatAsRead(userId: number, orderId: number): Promise<void> {
    // Usar raw SQL para copiar el timestamp EXACTO del último mensaje
    // directamente en MySQL, evitando pérdida de precisión de microsegundos
    // al pasar por JavaScript Date (que solo soporta milisegundos).
    await this.chatReadRepository.query(
      `INSERT INTO chat_reads (user_id, order_id, last_read_at)
       SELECT ?, ?, COALESCE(
         (SELECT MAX(created_at) FROM order_negotiations WHERE order_id = ?),
         NOW(6)
       )
       ON DUPLICATE KEY UPDATE last_read_at = VALUES(last_read_at)`,
      [userId, orderId, orderId],
    );
  }

  // 5. OBTENER CONTEOS DE MENSAJES NO LEÍDOS POR ORDEN
  async getUnreadCounts(userId: number): Promise<{ orderId: number; unreadCount: number }[]> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) return [];

    // Una sola query SQL que hace todo el cálculo dentro de MySQL,
    // evitando que los timestamps pasen por JavaScript Date (que pierde microsegundos).
    const providerCondition = user.providerId
      ? `OR p.id = ?`
      : `OR p.user_id = ?`;
    const providerParam = user.providerId || userId;

    const rows: { orderId: number; unreadCount: string }[] = await this.chatReadRepository.query(
      `SELECT n.order_id AS orderId, COUNT(*) AS unreadCount
       FROM order_negotiations n
       INNER JOIN orders o ON o.id = n.order_id
       LEFT JOIN providers p ON p.id = o.provider_id
       LEFT JOIN chat_reads cr ON cr.order_id = n.order_id AND cr.user_id = ?
       WHERE (o.client_id = ? ${providerCondition})
         AND n.author_id != ?
         AND (cr.last_read_at IS NULL OR n.created_at > cr.last_read_at)
       GROUP BY n.order_id
       HAVING COUNT(*) > 0`,
      [userId, userId, providerParam, userId],
    );

    return rows.map(r => ({ orderId: Number(r.orderId), unreadCount: Number(r.unreadCount) }));
  }
}