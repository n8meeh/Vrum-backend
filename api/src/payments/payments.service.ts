import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import { Subscription } from '../subscriptions/entities/subscription.entity';
import { Provider } from '../providers/entities/provider.entity';
import { User } from '../users/entities/user.entity';
import { EmailService } from '../auth/email.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private client: MercadoPagoConfig;

  constructor(
    @InjectRepository(Subscription) private subscriptionsRepo: Repository<Subscription>,
    @InjectRepository(Provider) private providersRepo: Repository<Provider>,
    @InjectRepository(User) private usersRepo: Repository<User>,
    private emailService: EmailService,
  ) {
    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
      this.logger.warn('MP_ACCESS_TOKEN no está configurada. Mercado Pago no funcionará.');
    } else {
      this.client = new MercadoPagoConfig({ accessToken });
      this.logger.log('Mercado Pago inicializado correctamente.');
    }
  }

  /**
   * Crea una preferencia de pago en Mercado Pago para activar Premium.
   * Recibe el providerId y genera un link de checkout.
   */
  async createPreference(providerId: number) {
    if (!this.client) {
      throw new BadRequestException('Mercado Pago no está configurado en el servidor.');
    }

    // Verificar que el provider existe
    const provider = await this.providersRepo.findOne({ where: { id: providerId } });
    if (!provider) {
      throw new NotFoundException('Proveedor no encontrado.');
    }

    // Verificar que no tenga ya una suscripción premium activa
    const activeSub = await this.subscriptionsRepo.findOne({
      where: { providerId: provider.id, status: 'active', plan: 'premium' },
    });
    if (activeSub) {
      throw new BadRequestException('Ya tienes una suscripción Premium activa.');
    }

    const backendUrl = process.env.BACKEND_URL || 'https://brumh.cl/api';
    const webUrl = process.env.WEB_URL || 'https://brumh.cl';

    const preference = new Preference(this.client);

    const result = await preference.create({
      body: {
        items: [
          {
            id: `premium_${providerId}`,
            title: 'Brumh Premium — Suscripción Mensual',
            description: 'Plan Premium para tu negocio en Brumh. Propuestas ilimitadas, visibilidad destacada y badge verificado.',
            quantity: 1,
            currency_id: 'CLP',
            unit_price: 9990,
          },
        ],
        external_reference: `premium_${providerId}_${Date.now()}`,
        notification_url: `${backendUrl}/payments/webhook`,
        back_urls: {
          success: `${webUrl}/premium/exito`,
          failure: `${webUrl}/premium/error`,
          pending: `${webUrl}/premium/pendiente`,
        },
        auto_return: 'approved',
        statement_descriptor: 'BRUMH PREMIUM',
        metadata: {
          provider_id: providerId,
        },
      },
    });

    this.logger.log(`Preferencia creada para provider ${providerId}: ${result.id}`);

    return {
      preferenceId: result.id,
      initPoint: result.init_point,        // Link de checkout producción
      sandboxInitPoint: result.sandbox_init_point, // Link de checkout sandbox (pruebas)
    };
  }

  /**
   * Procesa la notificación (webhook) de Mercado Pago.
   * Si el pago está aprobado, activa Premium para el proveedor.
   */
  async handleWebhook(body: any) {
    this.logger.log(`Webhook recibido: ${JSON.stringify(body)}`);

    // Mercado Pago envía distintos tipos de notificación
    if (body.type !== 'payment') {
      this.logger.log(`Tipo de notificación ignorada: ${body.type}`);
      return { received: true };
    }

    const paymentId = body.data?.id;
    if (!paymentId) {
      this.logger.warn('Webhook sin payment ID');
      return { received: true };
    }

    // Consultar los detalles del pago a Mercado Pago
    const payment = new Payment(this.client);
    let paymentData: any;

    try {
      paymentData = await payment.get({ id: paymentId });
    } catch (err) {
      this.logger.error(`Error al consultar pago ${paymentId}: ${err.message}`);
      return { received: true };
    }

    this.logger.log(`Pago ${paymentId} — status: ${paymentData.status}, external_ref: ${paymentData.external_reference}`);

    // Solo procesar pagos aprobados
    if (paymentData.status !== 'approved') {
      this.logger.log(`Pago ${paymentId} no aprobado (status: ${paymentData.status}). Ignorando.`);
      return { received: true };
    }

    // Extraer providerId del external_reference (formato: premium_{providerId}_{timestamp})
    const externalRef = paymentData.external_reference || '';
    const match = externalRef.match(/^premium_(\d+)_/);
    if (!match) {
      this.logger.warn(`external_reference no válida: ${externalRef}`);
      return { received: true };
    }

    const providerId = parseInt(match[1], 10);

    // Verificar que no se haya procesado ya esta referencia (idempotencia)
    const existingSub = await this.subscriptionsRepo.findOne({
      where: { externalReference: externalRef, plan: 'premium', status: 'active' },
    });
    if (existingSub) {
      this.logger.log(`Pago ya procesado para referencia ${externalRef}. Ignorando duplicado.`);
      return { received: true, already_processed: true };
    }

    // Activar Premium
    await this.activatePremium(providerId, externalRef, paymentId.toString());

    return { received: true, activated: true };
  }

  /**
   * Activa la suscripción Premium para un proveedor tras pago exitoso.
   */
  private async activatePremium(providerId: number, externalReference: string, paymentId: string) {
    const provider = await this.providersRepo.findOne({ where: { id: providerId } });
    if (!provider) {
      this.logger.error(`Provider ${providerId} no encontrado al activar premium.`);
      return;
    }

    // Cancelar cualquier trial activo existente
    const activeTrial = await this.subscriptionsRepo.findOne({
      where: { providerId, status: 'active', plan: 'trial' },
    });
    if (activeTrial) {
      activeTrial.status = 'expired';
      await this.subscriptionsRepo.save(activeTrial);
      this.logger.log(`Trial anterior del provider ${providerId} expirado.`);
    }

    // Crear suscripción premium (30 días)
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30);

    const subscription = this.subscriptionsRepo.create({
      providerId,
      plan: 'premium',
      status: 'active',
      startDate,
      endDate,
      paymentPlatform: 'mercadopago',
      externalReference,
    });

    await this.subscriptionsRepo.save(subscription);

    // Activar isPremium en el provider
    provider.isPremium = true;
    await this.providersRepo.save(provider);

    this.logger.log(`✅ Premium activado para provider ${providerId} (pago MP: ${paymentId})`);

    // Enviar correo de bienvenida Premium
    try {
      const user = await this.usersRepo.findOne({ where: { id: provider.userId } });
      if (user?.email) {
        await this.emailService.sendPremiumWelcomeEmail(
          user.email,
          provider.businessName || 'tu negocio',
        );
        this.logger.log(`Correo de bienvenida Premium enviado a ${user.email}`);
      }
    } catch (err) {
      this.logger.error(`Error al enviar correo de bienvenida Premium: ${err.message}`);
    }
  }
}
