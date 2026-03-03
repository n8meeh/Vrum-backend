import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as admin from 'firebase-admin';
import { Notification, NotificationType } from './entities/notification.entity';

@Injectable()
export class NotificationsService {

  constructor(
    @InjectRepository(Notification)
    private notificationRepo: Repository<Notification>,
  ) { }

  /** Guarda una notificación en base de datos para que el usuario la vea en la App. */
  async createInApp(
    userId: number,
    title: string,
    body: string,
    type: NotificationType = 'system',
    relatedId?: number,
  ): Promise<Notification> {
    const notification = this.notificationRepo.create({
      userId,
      title,
      body,
      type,
      ...(relatedId !== undefined && { relatedId }),
    });
    return this.notificationRepo.save(notification) as Promise<Notification>;
  }

  /** Lista paginada de notificaciones del usuario */
  async findByUser(userId: number, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [items, total] = await this.notificationRepo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return {
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** Marcar una notificación como leída */
  async markAsRead(notificationId: number, userId: number): Promise<void> {
    await this.notificationRepo.update(
      { id: notificationId, userId },
      { isRead: true },
    );
  }

  /** Marcar todas las notificaciones del usuario como leídas */
  async markAllAsRead(userId: number): Promise<void> {
    await this.notificationRepo.update(
      { userId, isRead: false },
      { isRead: true },
    );
  }

  /** Contar notificaciones no leídas */
  async getUnreadCount(userId: number): Promise<number> {
    return this.notificationRepo.count({
      where: { userId, isRead: false },
    });
  }

  // Función genérica para enviar Push
  async sendPushNotification(token: string, title: string, body: string, data?: any) {
    if (!token) return; // Si el usuario no tiene celular registrado, no hacemos nada

    try {
      await admin.messaging().send({
        token: token,
        notification: {
          title: title,
          body: body,
        },
        // Data sirve para que al tocar la notif, la App sepa a dónde ir (ej: ir a la orden 4)
        data: {
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
          ...data
        }
      });
      console.log(`🔔 Notificación enviada a: ${token.substring(0, 10)}...`);
    } catch (error) {
      console.error('Error enviando notificación:', error.message);
    }
  }
}
