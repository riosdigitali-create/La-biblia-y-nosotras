import type { Env } from '../env';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailProvider {
  readonly name: string;
  readonly enabled: boolean;
  send(msg: EmailMessage): Promise<{ ok: boolean; code?: string }>;
}

/**
 * Proveedor inactivo por defecto.
 * No simula el envío: informa con honestidad que no está configurado
 * y el trabajo queda registrado como SKIPPED en message_deliveries.
 */
export class DisabledEmailProvider implements EmailProvider {
  readonly name = 'disabled';
  readonly enabled = false;
  async send(): Promise<{ ok: boolean; code: string }> {
    return { ok: false, code: 'email_provider_not_configured' };
  }
}

export function getEmailProvider(env: Env): EmailProvider {
  if (env.EMAIL_ENABLED !== 'true' || !env.RESEND_API_KEY || !env.EMAIL_FROM) {
    return new DisabledEmailProvider();
  }
  return new ResendProvider(env.RESEND_API_KEY, env.EMAIL_FROM);
}

/** Implementación real, inactiva hasta que exista dominio verificado. */
export class ResendProvider implements EmailProvider {
  readonly name = 'resend';
  readonly enabled = true;
  constructor(private apiKey: string, private from: string) {}

  async send(msg: EmailMessage): Promise<{ ok: boolean; code?: string }> {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.from, to: [msg.to], subject: msg.subject,
          text: msg.text, ...(msg.html ? { html: msg.html } : {}),
        }),
      });
      if (!res.ok) return { ok: false, code: `http_${res.status}` };
      return { ok: true };
    } catch {
      return { ok: false, code: 'network_error' };
    }
  }
}
