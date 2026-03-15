import { Body, Controller, Post, Query, HttpCode } from '@nestjs/common';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * POST /payments/create-preference
   * Crea una preferencia de Mercado Pago para el pago Premium.
   * Público — El usuario llega desde el email con su providerId.
   * La seguridad del pago la maneja Mercado Pago.
   */
  @Post('create-preference')
  async createPreference(@Body('providerId') providerId: number) {
    return this.paymentsService.createPreference(providerId);
  }

  /**
   * POST /payments/webhook
   * Recibe notificaciones de Mercado Pago (IPN).
   * NO requiere autenticación — Mercado Pago lo llama directamente.
   */
  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(
    @Body() body: any,
    @Query('id') queryId?: string,
    @Query('topic') topic?: string,
  ) {
    // Mercado Pago puede enviar notificaciones en dos formatos:
    // 1. IPN v2 (JSON body con type y data.id)
    // 2. IPN legacy (query params: ?id=xxx&topic=payment)

    if (body?.type && body?.data?.id) {
      // Formato moderno (v2)
      return this.paymentsService.handleWebhook(body);
    }

    if (topic === 'payment' && queryId) {
      // Formato legacy — convertir a formato v2
      return this.paymentsService.handleWebhook({
        type: 'payment',
        data: { id: queryId },
      });
    }

    // Otro tipo de notificación
    return { received: true };
  }
}
