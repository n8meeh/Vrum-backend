import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AdminService } from './admin.service';
import { ApplyStrikeDto } from './dto/apply-strike.dto';
import { UnbanUserDto } from './dto/unban-user.dto';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
    constructor(
        private readonly adminService: AdminService,
        private readonly subscriptionsService: SubscriptionsService,
    ) {}

    /**
     * POST /admin/strike
     * Aplica un strike al usuario y calcula el ban automáticamente.
     */
    @Post('strike')
    applyStrike(@Body() dto: ApplyStrikeDto) {
        return this.adminService.applyStrike(dto.userId);
    }

    /**
     * POST /admin/unban
     * Desbanea a un usuario y restaura su visibilidad.
     */
    @Post('unban')
    unbanUser(@Body() dto: UnbanUserDto) {
        return this.adminService.unbanUser(dto.userId);
    }

    /**
     * GET /admin/moderation/:userId
     * Consulta info de moderación de un usuario.
     */
    @Get('moderation/:userId')
    getModerationInfo(@Param('userId', ParseIntPipe) userId: number) {
        return this.adminService.getUserModerationInfo(userId);
    }

    /**
     * GET /admin/fraud-alerts
     * Lista todas las alertas de fraude pendientes.
     */
    @Get('fraud-alerts')
    getFraudAlerts() {
        return this.subscriptionsService.getFraudAlerts();
    }

    /**
     * PATCH /admin/providers/:id
     * Actualiza el estado de verificación de un proveedor.
     * Body: { isVerified: 0 | 1 | 2 | 3 }
     */
    @Patch('providers/:id')
    updateProviderVerification(
        @Param('id', ParseIntPipe) id: number,
        @Body('isVerified') isVerified: number,
    ) {
        return this.adminService.updateProviderVerification(id, isVerified);
    }

    /**
     * PATCH /admin/fraud-alerts/:id/resolve
     * Resuelve una alerta de fraude (dismiss o confirm).
     */
    @Patch('fraud-alerts/:id/resolve')
    resolveFraudAlert(
        @Param('id', ParseIntPipe) id: number,
        @Body('action') action: 'dismissed' | 'confirmed',
        @Request() req,
    ) {
        return this.subscriptionsService.resolveFraudAlert(id, action, req.user.userId);
    }
}
