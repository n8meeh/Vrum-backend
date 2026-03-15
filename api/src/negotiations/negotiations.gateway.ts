import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
  ConnectedSocket,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class NegotiationsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  /**
   * Valida el JWT + session token al conectarse.
   * Si la validación falla, desconecta al cliente inmediatamente.
   */
  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token as string | undefined;
      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify<{
        sub: string | number;
        sessionToken: string;
      }>(token, {
        secret: process.env.JWT_SECRET || 'CLAVE_SECRETA_SUPER_SEGURA',
      });

      const user = await this.userRepo
        .createQueryBuilder('user')
        .select(['user.id', 'user.currentSessionToken'])
        .where('user.id = :id', { id: Number(payload.sub) })
        .getOne();

      if (!user || user.currentSessionToken !== payload.sessionToken) {
        client.disconnect();
        return;
      }

      // Guardar userId en el socket para uso posterior
      client.data.userId = Number(payload.sub);
    } catch {
      client.disconnect();
    }
  }

  /**
   * El cliente emite 'join-order' con el orderId para suscribirse
   * a los mensajes de esa orden en tiempo real.
   */
  @SubscribeMessage('join-order')
  handleJoinOrder(
    @ConnectedSocket() client: Socket,
    @MessageBody() orderId: number,
  ) {
    client.join(`order-${orderId}`);
  }

  /**
   * El cliente emite 'join-user' con su userId para recibir
   * actualizaciones de badges (notificaciones y chats) en tiempo real.
   */
  @SubscribeMessage('join-user')
  handleJoinUser(
    @ConnectedSocket() client: Socket,
    @MessageBody() userId: number,
  ) {
    client.join(`user-${userId}`);
  }

  /**
   * Emite un nuevo mensaje a todos los participantes de la orden.
   * Llamado por NegotiationsService después de guardar el mensaje en BD.
   */
  emitNewMessage(orderId: number, message: unknown) {
    this.server.to(`order-${orderId}`).emit('new_message', message);
  }

  /**
   * Emite evento de nueva notificación al usuario para actualizar badge.
   * Llamado por NotificationTriggerService cuando se crea una notificación.
   */
  emitNewNotification(userId: number) {
    this.server.to(`user-${userId}`).emit('new_notification');
  }

  /**
   * Emite evento de nuevo mensaje de chat al usuario para actualizar badge.
   * Llamado por NegotiationsService cuando se envía un mensaje.
   */
  emitNewChatMessage(userId: number) {
    this.server.to(`user-${userId}`).emit('new_chat_message');
  }
}
