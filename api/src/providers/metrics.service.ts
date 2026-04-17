import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProviderMetric } from './entities/provider-metric.entity';

type MetricField = 'profile_views' | 'clicks_whatsapp' | 'clicks_call' | 'clicks_route';

@Injectable()
export class MetricsService {
    constructor(
        @InjectRepository(ProviderMetric)
        private metricsRepo: Repository<ProviderMetric>,
    ) { }

    /**
     * Incrementa un contador de métrica para el día de hoy.
     * IMPORTANTE: Requiere un índice UNIQUE(provider_id, date) en la DB.
     */
    async track(providerId: number, field: MetricField): Promise<void> {
        const allowed: MetricField[] = ['profile_views', 'clicks_whatsapp', 'clicks_call', 'clicks_route'];
        if (!allowed.includes(field)) return;

        await this.metricsRepo.query(
            `INSERT INTO provider_metrics (provider_id, date, ${field})
             VALUES (?, CURDATE(), 1)
             ON DUPLICATE KEY UPDATE ${field} = ${field} + 1`,
            [providerId],
        );
    }

    /**
     * Devuelve las métricas de un mes específico (por defecto el actual).
     * Esto hace que el dashboard se "resetee" cada mes.
     */
    async getMonthlyStats(providerId: number, month?: number, year?: number): Promise<{
        profileViews: number;
        clicksWhatsapp: number;
        clicksCall: number;
        clicksRoute: number;
        totalClicks: number;
    }> {
        const targetMonth = month || new Date().getMonth() + 1;
        const targetYear = year || new Date().getFullYear();

        const rows = await this.metricsRepo.query(
            `SELECT
                COALESCE(SUM(profile_views), 0)   AS profileViews,
                COALESCE(SUM(clicks_whatsapp), 0) AS clicksWhatsapp,
                COALESCE(SUM(clicks_call), 0)     AS clicksCall,
                COALESCE(SUM(clicks_route), 0)    AS clicksRoute
             FROM provider_metrics
             WHERE provider_id = ?
               AND MONTH(date) = ?
               AND YEAR(date) = ?`,
            [providerId, targetMonth, targetYear],
        );

        const r = rows[0] || {};
        const profileViews = Number(r.profileViews) || 0;
        const clicksWhatsapp = Number(r.clicksWhatsapp) || 0;
        const clicksCall = Number(r.clicksCall) || 0;
        const clicksRoute = Number(r.clicksRoute) || 0;
        const totalClicks = clicksWhatsapp + clicksCall + clicksRoute;

        return { profileViews, clicksWhatsapp, clicksCall, clicksRoute, totalClicks };
    }

    /**
     * Devuelve un resumen mensual de los últimos 12 meses.
     */
    async getHistory(providerId: number) {
        return await this.metricsRepo.query(
            `SELECT 
                DATE_FORMAT(date, '%Y-%m') AS month,
                YEAR(date) AS year,
                CAST(SUM(profile_views) AS UNSIGNED) as profileViews,
                CAST(SUM(clicks_whatsapp) AS UNSIGNED) as clicksWhatsapp,
                CAST(SUM(clicks_call) AS UNSIGNED) as clicksCall,
                CAST(SUM(clicks_route) AS UNSIGNED) as clicksRoute,
                CAST(SUM(clicks_whatsapp + clicks_call + clicks_route) AS UNSIGNED) as totalClicks
             FROM provider_metrics
             WHERE provider_id = ?
             GROUP BY month, year
             ORDER BY month DESC
             LIMIT 12`,
            [providerId],
        );
    }
}
