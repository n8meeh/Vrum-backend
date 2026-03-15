import { Injectable, Logger, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Not, Repository } from 'typeorm';
import { Subscription } from './entities/subscription.entity';
import { FraudAlert } from './entities/fraud-alert.entity';
import { Provider } from '../providers/entities/provider.entity';
import { User } from '../users/entities/user.entity';
import { EmailService } from '../auth/email.service';

/**
 * Calcula la distancia en metros entre dos coordenadas usando la fórmula de Haversine.
 */
function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371000; // Radio de la Tierra en metros
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Calcula similitud entre dos strings (0-100).
 * Usa distancia de Levenshtein normalizada.
 */
function nameSimilarity(a: string, b: string): number {
  const s1 = a.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const s2 = b.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (s1 === s2) return 100;
  if (s1.includes(s2) || s2.includes(s1)) return 85;

  const len1 = s1.length;
  const len2 = s2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) matrix[i] = [i];
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  const maxLen = Math.max(len1, len2);
  return maxLen === 0 ? 100 : Math.round((1 - matrix[len1][len2] / maxLen) * 100);
}

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    @InjectRepository(Subscription) private subscriptionsRepository: Repository<Subscription>,
    @InjectRepository(FraudAlert) private fraudAlertsRepository: Repository<FraudAlert>,
    @InjectRepository(Provider) private providersRepository: Repository<Provider>,
    @InjectRepository(User) private usersRepo: Repository<User>,
    private emailService: EmailService,
  ) {}

  async getMySubscription(userId: number) {
    const provider = await this.providersRepository.findOne({ where: { userId } });
    if (!provider) return null;

    return this.subscriptionsRepository.findOne({
      where: { providerId: provider.id },
      order: { createdAt: 'DESC' },
    });
  }

  async requestPremium(userId: number) {
    // 1. Verificar que sea proveedor
    const provider = await this.providersRepository.findOne({ where: { userId } });
    if (!provider) {
      throw new BadRequestException('Necesitas tener un negocio registrado para solicitar Premium');
    }

    // 2. Obtener email del usuario
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user?.email) {
      throw new BadRequestException('No se encontró un correo electrónico asociado a tu cuenta');
    }

    // 3. Enviar correo con enlace de pago (incluye providerId para checkout directo)
    const webUrl = process.env.WEB_URL || 'https://brumh.cl';
    const paymentUrl = `${webUrl}/premium?providerId=${provider.id}`;

    await this.emailService.sendPremiumRequestEmail(
      user.email,
      provider.businessName || 'tu negocio',
      paymentUrl,
    );

    return {
      message: '¡Enlace enviado! Revisa tu bandeja de entrada para completar la activación en nuestra web.',
    };
  }

  async activateTrial(userId: number, deviceId?: string) {
    // 1. Verificar que sea proveedor
    const provider = await this.providersRepository.findOne({ where: { userId } });
    if (!provider) {
      throw new BadRequestException('Necesitas tener un negocio registrado para activar la prueba gratuita');
    }

    // 2. Verificar que no haya tenido trial/premium antes (por provider)
    const existingSub = await this.subscriptionsRepository.findOne({
      where: { providerId: provider.id },
    });
    if (existingSub) {
      throw new ConflictException('Ya utilizaste tu período de prueba gratuito o ya tienes una suscripción activa');
    }

    // 3. Verificar que este dispositivo no haya usado un trial antes (anti-abuso)
    if (deviceId) {
      const deviceSub = await this.subscriptionsRepository.findOne({
        where: { deviceId, plan: 'trial' },
      });
      if (deviceSub) {
        throw new ConflictException('Ya utilizaste tu período de prueba gratuito o ya tienes una suscripción activa');
      }
    }

    // 4. Crear suscripción trial de 30 días
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30);

    const subscription = this.subscriptionsRepository.create({
      providerId: provider.id,
      plan: 'trial',
      status: 'active',
      startDate,
      endDate,
      paymentPlatform: 'simulated',
      externalReference: `trial_${provider.id}_${Date.now()}`,
      deviceId: deviceId || null,
    });

    const saved = await this.subscriptionsRepository.save(subscription);

    // 5. Activar is_premium en el proveedor
    provider.isPremium = true;
    await this.providersRepository.save(provider);

    // 6. Detección de fraude: buscar negocios cercanos con nombre similar (no bloquea, solo alerta)
    this.detectSuspiciousTrial(provider).catch((err) => {
      this.logger.error(`Error en detección de fraude para provider ${provider.id}: ${err.message}`);
    });

    return {
      message: '¡Tu mes gratis Premium ha sido activado! Disfruta de propuestas ilimitadas y más.',
      subscription: saved,
      isPremium: true,
      expiresAt: endDate.toISOString(),
    };
  }

  /**
   * Busca proveedores cercanos (<100m) con nombre similar (>70% similitud).
   * Si encuentra coincidencias, crea alertas de fraude para revisión manual.
   */
  private async detectSuspiciousTrial(provider: Provider): Promise<void> {
    if (!provider.lat || !provider.lng) return;

    const providerLat = Number(provider.lat);
    const providerLng = Number(provider.lng);
    if (isNaN(providerLat) || isNaN(providerLng)) return;

    // Buscar todos los proveedores que hayan tenido un trial antes (excluir el actual)
    const subscriptionsWithTrial = await this.subscriptionsRepository.find({
      where: { plan: 'trial' },
      select: ['providerId'],
    });

    const trialProviderIds = subscriptionsWithTrial
      .map((s) => s.providerId)
      .filter((id) => id !== provider.id);

    if (trialProviderIds.length === 0) return;

    // Buscar esos proveedores con coordenadas
    const previousProviders = await this.providersRepository
      .createQueryBuilder('p')
      .where('p.id IN (:...ids)', { ids: trialProviderIds })
      .andWhere('p.lat IS NOT NULL')
      .andWhere('p.lng IS NOT NULL')
      .getMany();

    for (const prev of previousProviders) {
      const prevLat = Number(prev.lat);
      const prevLng = Number(prev.lng);
      if (isNaN(prevLat) || isNaN(prevLng)) continue;

      const distance = haversineDistance(providerLat, providerLng, prevLat, prevLng);

      // Solo considerar negocios a menos de 100 metros
      if (distance > 100) continue;

      const similarity = nameSimilarity(provider.businessName, prev.businessName);

      // Solo alertar si la similitud del nombre es > 70%
      if (similarity < 70) continue;

      // Verificar que no exista ya una alerta para esta combinación
      const existingAlert = await this.fraudAlertsRepository.findOne({
        where: {
          providerId: provider.id,
          similarProviderId: prev.id,
        },
      });
      if (existingAlert) continue;

      // Crear alerta de fraude
      const alert = this.fraudAlertsRepository.create({
        providerId: provider.id,
        similarProviderId: prev.id,
        providerName: provider.businessName,
        similarProviderName: prev.businessName,
        distanceMeters: Math.round(distance * 100) / 100,
        nameSimilarity: similarity,
        status: 'pending',
      });

      await this.fraudAlertsRepository.save(alert);

      this.logger.warn(
        `⚠️ Alerta de fraude: "${provider.businessName}" (ID:${provider.id}) ` +
        `similar a "${prev.businessName}" (ID:${prev.id}) — ` +
        `${distance.toFixed(1)}m de distancia, ${similarity}% similitud`,
      );
    }
  }

  // ── Admin: Gestión de alertas de fraude ──

  async getFraudAlerts(): Promise<FraudAlert[]> {
    return this.fraudAlertsRepository.find({
      where: { status: 'pending' },
      order: { createdAt: 'DESC' },
    });
  }

  async resolveFraudAlert(alertId: number, status: 'dismissed' | 'confirmed', reviewedBy: number) {
    const alert = await this.fraudAlertsRepository.findOne({ where: { id: alertId } });
    if (!alert) {
      throw new BadRequestException('Alerta no encontrada');
    }

    alert.status = status;
    alert.reviewedBy = reviewedBy;
    await this.fraudAlertsRepository.save(alert);

    // Si se confirma fraude, cancelar la suscripción trial del proveedor sospechoso
    if (status === 'confirmed') {
      const sub = await this.subscriptionsRepository.findOne({
        where: { providerId: alert.providerId, status: 'active', plan: 'trial' },
      });

      if (sub) {
        sub.status = 'cancelled';
        await this.subscriptionsRepository.save(sub);

        // Desactivar premium
        await this.providersRepository.update(alert.providerId, { isPremium: false });

        this.logger.warn(
          `🚫 Trial cancelado por fraude confirmado: provider ${alert.providerId} ("${alert.providerName}")`,
        );
      }
    }

    return alert;
  }

  /**
   * Expira suscripciones cuya endDate ya pasó.
   * - Cambia status a 'expired'
   * - Desactiva isPremium en el provider
   * Retorna la cantidad de suscripciones expiradas.
   */
  async expireSubscriptions(): Promise<number> {
    const now = new Date();

    // Buscar suscripciones activas con fecha de fin vencida
    const expiredSubs = await this.subscriptionsRepository.find({
      where: {
        status: 'active',
        endDate: LessThanOrEqual(now),
      },
    });

    if (expiredSubs.length === 0) return 0;

    for (const sub of expiredSubs) {
      // 1. Marcar suscripción como expirada
      sub.status = 'expired';
      await this.subscriptionsRepository.save(sub);

      // 2. Desactivar isPremium en el provider
      await this.providersRepository.update(sub.providerId, { isPremium: false });

      this.logger.log(`Suscripción ${sub.id} del provider ${sub.providerId} expirada (plan: ${sub.plan})`);
    }

    return expiredSubs.length;
  }
}
