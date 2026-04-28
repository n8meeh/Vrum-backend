import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private resend: Resend | null = null;
  private readonly logger = new Logger(EmailService.name);
  private readonly from: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    // SUPPORT_EMAIL debe ser un dominio verificado en Resend (ej: soporte@brumh.cl)
    // NO usar @gmail.com ni dominios externos sin verificar — Resend los rechaza con 403.
    // Mientras no tengas dominio verificado, usa onboarding@resend.dev (solo para pruebas).
    const supportEmail = process.env.SUPPORT_EMAIL;
    this.from = `Brumh <${supportEmail}>`;

    if (!apiKey) {
      this.logger.warn(
        'RESEND_API_KEY no está configurada. Los correos no se enviarán.',
      );
    } else {
      this.resend = new Resend(apiKey);
      this.logger.log(`Resend inicializado. FROM: ${this.from}`);
      if (!supportEmail.endsWith('@resend.dev') && !supportEmail.includes('brumh.cl')) {
        this.logger.warn(
          `ATENCIÓN: El dominio del remitente (${supportEmail}) debe estar verificado en https://resend.com/domains`,
        );
      }
    }
  }

  async sendPasswordResetEmail(to: string, code: string): Promise<void> {
    const year = new Date().getFullYear();

    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tu código de verificación - Brumh</title>
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;">

          <!-- ══════ HEADER + LOGO TEXTO ══════ -->
          <tr>
            <td style="padding-top: 10px">
              <img src="https://brumh.cl/assets/LogoClaroLogin-B2ZMPOfG.png" alt="Brumh Logo" width="180" height="100" style="display:block;margin:0 auto 12px;background-color: #f0f0f0;">
            </td>
          </tr>

          <!-- ══════ CUERPO ══════ -->
          <tr>
            <td>
              <h2 style="margin:0 0 10px;color:#0f172a;font-size:22px;font-weight:700;text-align:center;">
                Tu código de verificación
              </h2>
              <p style="margin:0;color:#475569;font-size:14px;line-height:1.7;text-align:center;">
                Ingresa este código en la app de Brumh para restablecer tu contraseña. No lo compartas con nadie.
              </p>
            </td>
          </tr>

          <!-- ══════ CÓDIGO ══════ -->
          <tr>
            <td align="center" style="padding:20px 40px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border:2px solid #e2e8f0;border-radius:12px;width:100%;">
                <tr>
                  <td style="padding:20px 24px;text-align:center;">
                    <p style="margin:0 0 8px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:2px;font-weight:600;">
                      Tu código
                    </p>
                    <p style="margin:0;color:#2563eb;font-size:40px;font-weight:800;letter-spacing:12px;font-family:'Courier New',Courier,monospace;line-height:1;">
                      ${code}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ══════ AVISO ══════ -->
          <tr>
            <td style="padding:0 40px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fffbeb;border-left:4px solid #f59e0b;border-radius:8px;">
                <tr>
                  <td style="padding:14px 16px;">
                    <p style="margin:0;color:#92400e;font-size:13px;line-height:1.6;">
                      ⏱ Este código expira en <strong>1 hora</strong>. Si no solicitaste este cambio, ignora este correo.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ══════ SEPARADOR ══════ -->
          <tr>
            <td style="padding:0 40px;">
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:0;">
            </td>
          </tr>

          <!-- ══════ FOOTER ══════ -->
          <tr>
            <td style="padding:24px 40px 28px;text-align:center;">
              <p style="margin:0 0 4px;color:#94a3b8;font-size:11px;">
                © ${year} Brumh · Todos los derechos reservados
              </p>
              <p style="margin:0;color:#cbd5e1;font-size:10px;">
                Correo automático — no respondas a este mensaje
              </p>
            </td>
          </tr>

        </table>

        <!-- Texto fuera de tarjeta -->
        <table role="presentation" width="520" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:16px 40px 0;text-align:center;">
              <p style="margin:0;color:#94a3b8;font-size:10px;line-height:1.5;">
                Recibiste este correo porque alguien solicitó restablecer la contraseña de tu cuenta en Brumh.
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;

    await this.sendEmail(to, `${code} — Código de verificación Brumh`, html);
  }

  async sendProviderWelcomeEmail(to: string, providerName: string): Promise<void> {
    const year = new Date().getFullYear();

    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bienvenido a Brumh</title>
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;">

          <!-- ══════ HEADER ══════ -->
          <tr>
            <td style="padding-top: 10px">
<img src="https://brumh.cl/assets/LogoClaroLogin-B2ZMPOfG.png" alt="Brumh Logo" width="180" height="100" style="display:block;margin:0 auto 12px;background-color: #f0f0f0;">
            </td>
          </tr>

          <!-- ══════ ICONO BIENVENIDA ══════ -->
          <tr>
            <td align="center">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#ecfdf5;width:72px;height:72px;border-radius:36px;text-align:center;vertical-align:middle;font-size:36px;">
                    🎉
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ══════ CUERPO ══════ -->
          <tr>
            <td style="padding:24px 40px 16px;">
              <h2 style="margin:0 0 10px;color:#0f172a;font-size:22px;font-weight:700;text-align:center;">
                ¡Bienvenido a Brumh, ${providerName}!
              </h2>
              <p style="margin:0;color:#475569;font-size:14px;line-height:1.7;text-align:center;">
                Tu negocio ya está registrado en nuestra plataforma. Ahora miles de conductores podrán encontrarte y solicitar tus servicios.
              </p>
            </td>
          </tr>

          <!-- ══════ PRÓXIMOS PASOS ══════ -->
          <tr>
            <td style="padding:16px 40px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f9ff;border-left:4px solid #2563eb;border-radius:8px;">
                <tr>
                  <td style="padding:20px 16px;">
                    <p style="margin:0 0 12px;color:#1e40af;font-size:14px;font-weight:700;">
                      Próximos pasos para destacar:
                    </p>
                    <p style="margin:0 0 8px;color:#334155;font-size:13px;line-height:1.6;">
                      ✅ Completa tu perfil con fotos y descripción
                    </p>
                    <p style="margin:0 0 8px;color:#334155;font-size:13px;line-height:1.6;">
                      ✅ Agrega tus servicios y/o productos además de sus respectivos precios
                    </p>
                    <p style="margin:0 0 8px;color:#334155;font-size:13px;line-height:1.6;">
                      ✅ Configura tu ubicación para aparecer en el mapa
                    </p>
                    <p style="margin:0;color:#334155;font-size:13px;line-height:1.6;">
                      ✅ Publica en la comunidad para ganar visibilidad
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ══════ SEPARADOR ══════ -->
          <tr>
            <td style="padding:0 40px;">
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:0;">
            </td>
          </tr>

          <!-- ══════ FOOTER ══════ -->
          <tr>
            <td style="padding:24px 40px 28px;text-align:center;">
              <p style="margin:0 0 4px;color:#94a3b8;font-size:11px;">
                © ${year} Brumh · Todos los derechos reservados
              </p>
              <p style="margin:0;color:#cbd5e1;font-size:10px;">
                Correo automático — no respondas a este mensaje
              </p>
            </td>
          </tr>

        </table>

        <!-- Texto fuera de tarjeta -->
        <table role="presentation" width="520" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:16px 40px 0;text-align:center;">
              <p style="margin:0;color:#94a3b8;font-size:10px;line-height:1.5;">
                Recibiste este correo porque creaste un negocio en Brumh.
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;

    await this.sendEmail(to, `¡Bienvenido a Brumh, ${providerName}! 🎉`, html);
  }

  async sendProviderClosedEmail(to: string, providerName: string): Promise<void> {
    const year = new Date().getFullYear();
    const supportEmail = 'contactobrumh@gmail.com';

    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Negocio cerrado - Brumh</title>
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;">

          <!-- ══════ HEADER ══════ -->
          <tr>
            <td style="padding-top: 10px">
              <img src="https://brumh.cl/assets/LogoClaroLogin-B2ZMPOfG.png" alt="Brumh Logo" width="180" height="100" style="display:block;margin:0 auto 12px;background-color: #f0f0f0;">
            </td>
          </tr>

          <!-- ══════ CUERPO ══════ -->
          <tr>
            <td>
              <h2 style="margin:0 0 10px;color:#0f172a;font-size:22px;font-weight:700;text-align:center;">
                Tu negocio ha sido cerrado
              </h2>
              <p style="margin:0;color:#475569;font-size:14px;line-height:1.7;text-align:center;">
                Hola, te confirmamos que <strong>${providerName}</strong> ha sido cerrado exitosamente en Brumh. Tu historial y datos han sido preservados.
              </p>
            </td>
          </tr>

          <!-- ══════ INFO ══════ -->
          <tr>
            <td style="padding:16px 40px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef2f2;border-left:4px solid #ef4444;border-radius:8px;">
                <tr>
                  <td style="padding:16px;">
                    <p style="margin:0 0 8px;color:#991b1b;font-size:14px;font-weight:700;">
                      ¿Qué sucede ahora?
                    </p>
                    <p style="margin:0 0 6px;color:#334155;font-size:13px;line-height:1.6;">
                      • Tu negocio ya no aparece en el mapa ni en búsquedas
                    </p>
                    <p style="margin:0 0 6px;color:#334155;font-size:13px;line-height:1.6;">
                      • Los usuarios de Brumh no podrán contactarte ni solicitar tus servicios mediante la app
                    </p>
                    <p style="margin:0 0 6px;color:#334155;font-size:13px;line-height:1.6;">
                      • El personal vinculado ha sido desvinculado
                    </p>
                    <p style="margin:0;color:#334155;font-size:13px;line-height:1.6;">
                      • Puedes volver a crear tu negocio en cualquier momento
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ══════ CONTACTO ══════ -->
          <tr>
            <td style="padding:0 40px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;">
                <tr>
                  <td style="padding:16px;text-align:center;">
                    <p style="margin:0;color:#475569;font-size:13px;line-height:1.6;">
                      ¿Necesitas ayuda o tienes dudas? Escríbenos a <a href="mailto:${supportEmail}" style="color:#2563eb;text-decoration:none;font-weight:600;">${supportEmail}</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ══════ SEPARADOR ══════ -->
          <tr>
            <td style="padding:0 40px;">
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:0;">
            </td>
          </tr>

          <!-- ══════ FOOTER ══════ -->
          <tr>
            <td style="padding:24px 40px 28px;text-align:center;">
              <p style="margin:0 0 4px;color:#94a3b8;font-size:11px;">
                © ${year} Brumh · Todos los derechos reservados
              </p>
              <p style="margin:0;color:#cbd5e1;font-size:10px;">
                Correo automático — no respondas a este mensaje
              </p>
            </td>
          </tr>

        </table>

        <!-- Texto fuera de tarjeta -->
        <table role="presentation" width="520" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:16px 40px 0;text-align:center;">
              <p style="margin:0;color:#94a3b8;font-size:10px;line-height:1.5;">
                Recibiste este correo porque tu negocio fue cerrado en Brumh.
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;

    await this.sendEmail(to, `Tu negocio ${providerName} ha sido cerrado en Brumh`, html);
  }

  async sendPremiumRequestEmail(to: string, providerName: string, paymentUrl: string): Promise<void> {
    const year = new Date().getFullYear();
    const supportEmail = 'contactobrumh@gmail.com';

    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Activa Brumh Premium</title>
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;">

          <!-- ══════ HEADER ══════ -->
          <tr>
              <td style="padding-top: 10px">
              <img src="https://brumh.cl/assets/LogoClaroLogin-B2ZMPOfG.png" alt="Brumh Logo" width="180" height="100" style="display:block;margin:0 auto 12px;background-color: #f0f0f0;">
            </td>
          </tr>

          <!-- ══════ ICONO PREMIUM ══════ -->
          <tr>
            <td align="center">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#fef3c7;width:72px;height:72px;border-radius:36px;text-align:center;vertical-align:middle;font-size:36px;">
                    ⭐
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ══════ CUERPO ══════ -->
          <tr>
            <td style="padding:24px 40px 16px;">
              <h2 style="margin:0 0 10px;color:#0f172a;font-size:22px;font-weight:700;text-align:center;">
                ¡Hola, ${providerName}! Estás a un paso de Premium
              </h2>
              <p style="margin:0;color:#475569;font-size:14px;line-height:1.7;text-align:center;">
                Hemos recibido tu solicitud para activar las funciones avanzadas de Brumh para tu negocio. Con el plan Premium podrás destacar en las búsquedas, gestionar más servicios y conectar con más conductores en tu zona.
              </p>
            </td>
          </tr>

          <!-- ══════ BENEFICIOS ══════ -->
          <tr>
            <td style="padding:16px 40px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fffbeb;border-left:4px solid #f59e0b;border-radius:8px;">
                <tr>
                  <td style="padding:20px 16px;">
                    <p style="margin:0 0 12px;color:#92400e;font-size:14px;font-weight:700;">
                      Con Premium obtienes:
                    </p>
                    <p style="margin:0 0 6px;color:#334155;font-size:13px;line-height:1.6;">
                      ⭐ Propuestas y publicaciones ilimitadas
                    </p>
                    <p style="margin:0 0 6px;color:#334155;font-size:13px;line-height:1.6;">
                      ⭐ Badge de verificado y prioridad en el mapa
                    </p>
                    <p style="margin:0 0 6px;color:#334155;font-size:13px;line-height:1.6;">
                      ⭐ Estadísticas avanzadas de tu negocio
                    </p>
                    <p style="margin:0;color:#334155;font-size:13px;line-height:1.6;">
                      ⭐ Gestión de equipo y personal
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ══════ BOTÓN CTA ══════ -->
          <tr>
            <td align="center" style="padding:0 40px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#2563eb;border-radius:12px;">
                    <a href="${paymentUrl}" target="_blank" style="display:inline-block;padding:16px 48px;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;letter-spacing:0.5px;">
                      ACTIVAR PREMIUM AHORA
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ══════ LINK ALTERNATIVO ══════ -->
          <tr>
            <td style="padding:0 40px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;">
                <tr>
                  <td style="padding:14px 16px;text-align:center;">
                    <p style="margin:0 0 6px;color:#64748b;font-size:11px;">
                      Si el botón no funciona, copia y pega este enlace en tu navegador:
                    </p>
                    <p style="margin:0;color:#2563eb;font-size:11px;word-break:break-all;">
                      ${paymentUrl}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ══════ CONTACTO ══════ -->
          <tr>
            <td style="padding:0 40px 28px;text-align:center;">
              <p style="margin:0;color:#475569;font-size:13px;line-height:1.6;">
                ¿Tienes dudas? Escríbenos a <a href="mailto:${supportEmail}" style="color:#2563eb;text-decoration:none;font-weight:600;">${supportEmail}</a>
              </p>
            </td>
          </tr>

          <!-- ══════ SEPARADOR ══════ -->
          <tr>
            <td style="padding:0 40px;">
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:0;">
            </td>
          </tr>

          <!-- ══════ FOOTER ══════ -->
          <tr>
            <td style="padding:24px 40px 28px;text-align:center;">
              <p style="margin:0 0 4px;color:#94a3b8;font-size:11px;">
                © ${year} Brumh · Todos los derechos reservados
              </p>
              <p style="margin:0;color:#cbd5e1;font-size:10px;">
                Correo automático — no respondas a este mensaje
              </p>
            </td>
          </tr>

        </table>

        <!-- Texto fuera de tarjeta -->
        <table role="presentation" width="520" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:16px 40px 0;text-align:center;">
              <p style="margin:0;color:#94a3b8;font-size:10px;line-height:1.5;">
                Recibiste este correo porque solicitaste información sobre Brumh Premium desde la app.
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;

    await this.sendEmail(to, '🚀 Todo listo para potenciar tu negocio en Brumh', html);
  }

  async sendPremiumWelcomeEmail(to: string, providerName: string): Promise<void> {
    const year = new Date().getFullYear();
    const supportEmail = 'contactobrumh@gmail.com';

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>¡Bienvenido a Brumh Premium!</title>
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;">

          <!-- ══════ HEADER ══════ -->
          <tr>
            <td style="padding-top: 10px">
              <img src="https://brumh.cl/assets/LogoClaroLogin-B2ZMPOfG.png" alt="Brumh Logo" width="180" height="100" style="display:block;margin:0 auto 12px;background-color: #f0f0f0;">
            </td>
          </tr>

          <!-- ══════ ICONO PREMIUM ══════ -->
          <tr>
            <td align="center">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:linear-gradient(145deg,#2563eb 0%,#1d4ed8 100%);width:72px;height:72px;border-radius:36px;text-align:center;vertical-align:middle;font-size:36px;">
                    ⭐
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ══════ CUERPO ══════ -->
          <tr>
            <td style="padding:24px 40px 16px;">
              <h2 style="margin:0 0 10px;color:#0f172a;font-size:22px;font-weight:700;text-align:center;">
                ¡Bienvenido a Brumh Premium, ${providerName}!
              </h2>
              <p style="margin:0;color:#475569;font-size:14px;line-height:1.7;text-align:center;">
                Tu pago ha sido procesado exitosamente. Ahora tu negocio cuenta con todas las herramientas Premium para crecer y destacar en Brumh.
              </p>
            </td>
          </tr>

          <!-- ══════ QUÉ INCLUYE ══════ -->
          <tr>
            <td style="padding:16px 40px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eff6ff;border-left:4px solid #2563eb;border-radius:8px;">
                <tr>
                  <td style="padding:20px 16px;">
                    <p style="margin:0 0 12px;color:#1e40af;font-size:14px;font-weight:700;">
                      Tu plan Premium incluye:
                    </p>
                    <p style="margin:0 0 6px;color:#334155;font-size:13px;line-height:1.6;">
                      ⭐ Propuestas, servicios y productos ilimitados
                    </p>
                    <p style="margin:0 0 6px;color:#334155;font-size:13px;line-height:1.6;">
                      ⭐ Publicaciones y comentarios ilimitados
                    </p>
                    <p style="margin:0 0 6px;color:#334155;font-size:13px;line-height:1.6;">
                      ⭐ Badge de verificado Premium
                    </p>
                    <p style="margin:0 0 6px;color:#334155;font-size:13px;line-height:1.6;">
                      ⭐ Prioridad en el mapa y búsquedas
                    </p>
                    <p style="margin:0;color:#334155;font-size:13px;line-height:1.6;">
                      ⭐ Gestión de equipo y personal
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ══════ DETALLES DEL PAGO ══════ -->
          <tr>
            <td style="padding:0 40px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;">
                <tr>
                  <td style="padding:16px;text-align:center;">
                    <p style="margin:0 0 4px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">
                      Detalle
                    </p>
                    <p style="margin:0 0 2px;color:#0f172a;font-size:16px;font-weight:700;">
                      Brumh Premium — $9.990 CLP/mes
                    </p>
                    <p style="margin:0;color:#64748b;font-size:12px;">
                      Pago procesado vía Mercado Pago
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ══════ CONTACTO ══════ -->
          <tr>
            <td style="padding:0 40px 28px;text-align:center;">
              <p style="margin:0;color:#475569;font-size:13px;line-height:1.6;">
                ¿Necesitas ayuda? Escríbenos a <a href="mailto:${supportEmail}" style="color:#2563eb;text-decoration:none;font-weight:600;">${supportEmail}</a>
              </p>
            </td>
          </tr>

          <!-- ══════ SEPARADOR ══════ -->
          <tr>
            <td style="padding:0 40px;">
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:0;">
            </td>
          </tr>

          <!-- ══════ FOOTER ══════ -->
          <tr>
            <td style="padding:24px 40px 28px;text-align:center;">
              <p style="margin:0 0 4px;color:#94a3b8;font-size:11px;">
                © ${year} Brumh · Todos los derechos reservados
              </p>
              <p style="margin:0;color:#cbd5e1;font-size:10px;">
                Correo automático — no respondas a este mensaje
              </p>
            </td>
          </tr>

        </table>

        <!-- Texto fuera de tarjeta -->
        <table role="presentation" width="520" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:16px 40px 0;text-align:center;">
              <p style="margin:0;color:#94a3b8;font-size:10px;line-height:1.5;">
                Recibiste este correo porque activaste Brumh Premium para tu negocio.
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;

    await this.sendEmail(to, `⭐ ¡Bienvenido a Brumh Premium, ${providerName}!`, html);
  }

  private async sendEmail(to: string, subject: string, html: string): Promise<void> {
    if (!this.resend) {
      this.logger.warn(`No se puede enviar correo a ${to}: RESEND_API_KEY no configurada.`);
      return;
    }

    try {
      const { data, error } = await this.resend.emails.send({
        from: this.from,
        to: [to],
        subject,
        html,
      });

      if (error) {
        this.logger.error(`Error al enviar email a ${to}: ${JSON.stringify(error)}`);
        throw new Error(`Error al enviar el correo: ${error.message}`);
      }

      this.logger.log(`Correo enviado a ${to} (ID: ${data?.id})`);
    } catch (err) {
      this.logger.error(`Fallo al enviar correo a ${to}: ${err.message}`);
      throw err;
    }
  }
}
