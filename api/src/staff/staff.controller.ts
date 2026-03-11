import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { StaffService } from './staff.service';
import { InviteStaffDto } from './dto/invite-staff.dto';
import { PremiumStaffGuard } from '../auth/guards/premium-staff.guard';
import { ProviderRoleGuard, ProviderRoles } from '../auth/guards/provider-role.guard';

@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  /**
   * POST /staff/invite — Invitar a un miembro al equipo
   * Solo: provider (dueño), provider_admin
   */
  @Post('invite')
  @UseGuards(PremiumStaffGuard, ProviderRoleGuard)
  @ProviderRoles('provider', 'provider_admin')
  invite(@Request() req, @Body() dto: InviteStaffDto) {
    return this.staffService.invite(req.user.id, dto.email, dto.role);
  }

  /**
   * POST /staff/accept/:token — Aceptar una invitación
   * Solo requiere estar autenticado
   */
  @Post('accept/:token')
  @UseGuards(AuthGuard('jwt'))
  accept(@Request() req, @Param('token') token: string) {
    return this.staffService.acceptInvitation(req.user.id, token);
  }

  /**
   * GET /staff/my-invitations — Ver invitaciones pendientes para el usuario actual
   * Cualquier usuario autenticado puede consultar
   */
  @Get('my-invitations')
  @UseGuards(AuthGuard('jwt'))
  getMyInvitations(@Request() req) {
    return this.staffService.getMyPendingInvitations(req.user.id);
  }

  /**
   * GET /staff/invitations — Listar invitaciones del negocio
   * Solo: provider (dueño), provider_admin
   */
  @Get('invitations')
  @UseGuards(PremiumStaffGuard, ProviderRoleGuard)
  @ProviderRoles('provider', 'provider_admin')
  getInvitations(@Request() req) {
    return this.staffService.getInvitations(req.user.id);
  }

  /**
   * GET /staff/members — Listar miembros del equipo
   * Todos los roles del negocio pueden ver
   */
  @Get('members')
  @UseGuards(PremiumStaffGuard, ProviderRoleGuard)
  @ProviderRoles('provider', 'provider_admin', 'provider_staff')
  getMembers(@Request() req) {
    return this.staffService.getMembers(req.user.id);
  }

  /**
   * POST /staff/leave — Abandonar el equipo
   * Solo: provider_admin, provider_staff
   */
  @Post('leave')
  @UseGuards(AuthGuard('jwt'))
  leave(@Request() req) {
    return this.staffService.leaveTeam(req.user.id);
  }

  /**
   * DELETE /staff/members/:userId — Eliminar miembro del equipo
   * Solo: provider (dueño), provider_admin
   */
  @Delete('members/:userId')
  @UseGuards(PremiumStaffGuard, ProviderRoleGuard)
  @ProviderRoles('provider', 'provider_admin')
  removeMember(@Request() req, @Param('userId', ParseIntPipe) memberUserId: number) {
    return this.staffService.removeMember(req.user.id, memberUserId);
  }

  /**
   * DELETE /staff/invitations/:id — Cancelar invitación pendiente
   * Solo: provider (dueño), provider_admin
   */
  @Delete('invitations/:id')
  @UseGuards(PremiumStaffGuard, ProviderRoleGuard)
  @ProviderRoles('provider', 'provider_admin')
  cancelInvitation(@Request() req, @Param('id', ParseIntPipe) invitationId: number) {
    return this.staffService.cancelInvitation(req.user.id, invitationId);
  }
}
