import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GroupMember } from '../groups/entities/group-member.entity';
import { NegotiationsGateway } from '../negotiations/negotiations.gateway';
import { User } from '../users/entities/user.entity';
import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationTriggerService {
  constructor(
    private notificationsService: NotificationsService,
    @InjectRepository(User)
    private usersRepo: Repository<User>,
    @InjectRepository(GroupMember)
    private groupMemberRepo: Repository<GroupMember>,
    @Inject(forwardRef(() => NegotiationsGateway))
    private gateway: NegotiationsGateway,
  ) {}

  /** Returns false if post belongs to a group and the author is no longer an active member */
  private async isActiveInPostGroup(
    groupId: number | null,
    userId: number,
  ): Promise<boolean> {
    if (!groupId) return true;
    const membership = await this.groupMemberRepo.findOne({
      where: { groupId, userId, status: 'active' },
    });
    return membership != null;
  }

  /** Notificar cuando un usuario sigue a otro */
  async onFollow(followerId: number, followedId: number): Promise<void> {
    if (followerId === followedId) return;

    const follower = await this.usersRepo.findOne({
      where: { id: followerId },
    });
    if (!follower) return;

    const followed = await this.usersRepo.findOne({
      where: { id: followedId },
    });
    if (!followed) return;

    const title = 'Nuevo seguidor';
    const body = `${follower.fullName || 'Alguien'} empezó a seguirte`;

    await this.notificationsService.createInApp(
      followedId,
      title,
      body,
      'social_follow',
      followerId,
    );
    this.gateway.emitNewNotification(followedId);

    if (followed.fcmToken) {
      await this.notificationsService.sendPushNotification(
        followed.fcmToken,
        title,
        body,
        { type: 'social_follow', relatedId: String(followerId) },
      );
    }
  }

  /** Notificar cuando un usuario da like a un post */
  async onLike(
    likerId: number,
    postId: number,
    postAuthorId: number,
    groupId?: number | null,
  ): Promise<void> {
    if (likerId === postAuthorId) return;

    if (!(await this.isActiveInPostGroup(groupId ?? null, postAuthorId)))
      return;

    const liker = await this.usersRepo.findOne({ where: { id: likerId } });
    if (!liker) return;

    const author = await this.usersRepo.findOne({
      where: { id: postAuthorId },
    });
    if (!author) return;

    const title = 'Nuevo like';
    const body = `A ${liker.fullName || 'Alguien'} le gustó tu publicación`;

    await this.notificationsService.createInApp(
      postAuthorId,
      title,
      body,
      'social_like',
      postId,
    );
    this.gateway.emitNewNotification(postAuthorId);

    if (author.fcmToken) {
      await this.notificationsService.sendPushNotification(
        author.fcmToken,
        title,
        body,
        { type: 'social_like', relatedId: String(postId) },
      );
    }
  }

  /** Notificar cuando alguien comenta en un post */
  async onComment(
    commenterId: number,
    postId: number,
    postAuthorId: number,
    displayName?: string,
    groupId?: number | null,
  ): Promise<void> {
    if (commenterId === postAuthorId) return;

    if (!(await this.isActiveInPostGroup(groupId ?? null, postAuthorId)))
      return;

    if (!displayName) {
      const commenter = await this.usersRepo.findOne({
        where: { id: commenterId },
      });
      displayName = commenter?.fullName || 'Alguien';
    }

    const author = await this.usersRepo.findOne({
      where: { id: postAuthorId },
    });
    if (!author) return;

    const title = 'Nuevo comentario';
    const body = `${displayName} comentó en tu publicación`;

    await this.notificationsService.createInApp(
      postAuthorId,
      title,
      body,
      'social_comment',
      postId,
    );
    this.gateway.emitNewNotification(postAuthorId);

    if (author.fcmToken) {
      await this.notificationsService.sendPushNotification(
        author.fcmToken,
        title,
        body,
        { type: 'social_comment', relatedId: String(postId) },
      );
    }
  }

  /** Notificar cuando un comentario es marcado como solución */
  async onSolutionMarked(
    postAuthorId: number,
    commentAuthorId: number,
    postId: number,
  ): Promise<void> {
    if (postAuthorId === commentAuthorId) return;

    const postAuthor = await this.usersRepo.findOne({
      where: { id: postAuthorId },
    });
    if (!postAuthor) return;

    const commentAuthor = await this.usersRepo.findOne({
      where: { id: commentAuthorId },
    });
    if (!commentAuthor) return;

    const title = 'Tu respuesta fue marcada como solución';
    const body = `${postAuthor.fullName || 'Alguien'} marcó tu comentario como solución`;

    await this.notificationsService.createInApp(
      commentAuthorId,
      title,
      body,
      'post_solved',
      postId,
    );
    this.gateway.emitNewNotification(commentAuthorId);

    if (commentAuthor.fcmToken) {
      await this.notificationsService.sendPushNotification(
        commentAuthor.fcmToken,
        title,
        body,
        { type: 'post_solved', relatedId: String(postId) },
      );
    }
  }

  /** Enviar push cuando se recibe un mensaje en el chat (sin crear notificación in-app) */
  async onChatMessage(
    senderId: number,
    senderName: string,
    recipientId: number,
    orderId: number,
  ): Promise<void> {
    if (senderId === recipientId) return;

    const recipient = await this.usersRepo.findOne({
      where: { id: recipientId },
    });
    if (!recipient) return;

    const title = 'Nuevo mensaje';
    const body = `${senderName} te envió un mensaje`;

    // Badge en tiempo real vía WebSocket
    this.gateway.emitNewChatMessage(recipientId);

    // Push notification
    if (recipient.fcmToken) {
      await this.notificationsService.sendPushNotification(
        recipient.fcmToken,
        title,
        body,
        { type: 'chat_message', relatedId: String(orderId) },
      );
    }
  }

  /** Notificar cuando se envía una invitación de negocio */
  async onBusinessInvite(
    inviterId: number,
    inviteeEmail: string,
    providerName: string,
  ): Promise<void> {
    const invitee = await this.usersRepo.findOne({
      where: { email: inviteeEmail },
    });
    if (!invitee) return; // El usuario invitado aún no tiene cuenta

    const inviter = await this.usersRepo.findOne({ where: { id: inviterId } });
    if (!inviter) return;

    const title = 'Invitación de equipo';
    const body = `${inviter.fullName || 'Alguien'} te invitó a unirte a ${providerName}`;

    await this.notificationsService.createInApp(
      invitee.id,
      title,
      body,
      'business_invite',
      inviterId,
    );
    this.gateway.emitNewNotification(invitee.id);

    if (invitee.fcmToken) {
      await this.notificationsService.sendPushNotification(
        invitee.fcmToken,
        title,
        body,
        { type: 'business_invite', relatedId: String(inviterId) },
      );
    }
  }

  /** Notify group creator/admins when someone requests to join a private group */
  async onGroupJoinRequest(
    requesterId: number,
    groupId: number,
    groupName: string,
    adminIds: number[],
  ): Promise<void> {
    const requester = await this.usersRepo.findOne({
      where: { id: requesterId },
    });
    if (!requester) return;

    const title = 'Nueva solicitud de grupo';
    const body = `${requester.fullName || 'Alguien'} quiere unirse a ${groupName}`;

    for (const adminId of adminIds) {
      if (adminId === requesterId) continue;
      await this.notificationsService.createInApp(
        adminId,
        title,
        body,
        'group_join_request',
        groupId,
      );
      this.gateway.emitNewNotification(adminId);

      const admin = await this.usersRepo.findOne({ where: { id: adminId } });
      if (admin?.fcmToken) {
        await this.notificationsService.sendPushNotification(
          admin.fcmToken,
          title,
          body,
          { type: 'group_join_request', relatedId: String(groupId) },
        );
      }
    }
  }

  /** Notify user when their group join request is approved or rejected */
  async onGroupRequestUpdate(
    userId: number,
    groupId: number,
    groupName: string,
    approved: boolean,
  ): Promise<void> {
    const title = approved ? 'Solicitud aprobada' : 'Solicitud rechazada';
    const body = approved
      ? `Tu solicitud para unirte a ${groupName} fue aprobada`
      : `Tu solicitud para unirte a ${groupName} fue rechazada`;

    await this.notificationsService.createInApp(
      userId,
      title,
      body,
      'group_request_update',
      groupId,
    );
    this.gateway.emitNewNotification(userId);

    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (user?.fcmToken) {
      await this.notificationsService.sendPushNotification(
        user.fcmToken,
        title,
        body,
        { type: 'group_request_update', relatedId: String(groupId) },
      );
    }
  }
}
