import type { Env } from '../env';

/**
 * Interfaz para WhatsApp Cloud API.
 * Desactivada a propósito: requiere credenciales de Meta y plantillas
 * aprobadas. No se implementa el envío hasta tenerlas.
 *
 * [PENDIENTE: credenciales de WhatsApp Cloud API y plantillas aprobadas.]
 */
export interface WhatsAppProvider {
  readonly enabled: boolean;
  sendTemplate(to: string, template: string, vars: string[]): Promise<{ ok: boolean; code?: string }>;
}

export class DisabledWhatsApp implements WhatsAppProvider {
  readonly enabled = false;
  async sendTemplate(): Promise<{ ok: boolean; code: string }> {
    return { ok: false, code: 'whatsapp_not_configured' };
  }
}

export function getWhatsAppProvider(env: Env): WhatsAppProvider {
  if (env.WHATSAPP_ENABLED !== 'true') return new DisabledWhatsApp();
  return new DisabledWhatsApp();
}
