export interface Env {
  DB: D1Database;

  /* Opcionales a propósito: en el primer despliegue no existen.
     Las siete llamadas a la cola van dentro de un `try`, así que
     su ausencia pierde el aviso pero nunca el dato. */
  FILES?: R2Bucket;
  JOBS?: Queue;

  APP_NAME: string;
  APP_ORIGIN: string;
  CONSENT_VERSION: string;
  AGREEMENT_VERSION: string;
  ADMIN_AUTH_MODE: 'access' | 'password';
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  EMAIL_ENABLED: string;
  EMAIL_FROM: string;
  WHATSAPP_ENABLED: string;

  // Conversación de acompañamiento.
  // CHAT_PROVIDER: 'anthropic' | 'openai' | 'workers-ai'. Vacío = chat apagado.
  CHAT_PROVIDER?: string;
  CHAT_MODEL?: string;
  /** Número de WhatsApp del equipo, en formato internacional sin signos. */
  CHAT_WHATSAPP?: string;
  /** Binding de Workers AI. Solo si CHAT_PROVIDER = 'workers-ai'. */
  AI?: { run: (model: string, input: unknown) => Promise<unknown> };

  // Secretos — nunca en wrangler.toml ni en el repositorio.
  SESSION_PEPPER: string;
  HASH_PEPPER: string;
  TURNSTILE_SECRET_KEY: string;
  /** Clave del proveedor del modelo. Solo secreto; jamás en wrangler.toml. */
  CHAT_API_KEY?: string;
  RESEND_API_KEY?: string;
  ADMIN_BOOTSTRAP_TOKEN?: string;

  /**
   * PIN corto de acceso al panel, para las pastoras.
   *
   * Es un atajo deliberado y menos seguro que la contraseña: seis
   * dígitos son un millón de combinaciones y no hay usuaria detrás,
   * así que no se puede saber quién entró. Lo que lo hace viable es
   * el freno: cinco fallos por IP bloquean quince minutos, y con eso
   * agotar el millón lleva años, no minutos.
   *
   * Va SIEMPRE como secreto —`wrangler pages secret put PANEL_PIN`—
   * y jamás en wrangler.toml, en el repositorio ni en JavaScript de
   * cliente. Vacío = el atajo no existe y solo entra la contraseña.
   */
  PANEL_PIN?: string;
  /** Cuenta a la que se atribuye la sesión abierta con PIN. */
  PANEL_PIN_EMAIL?: string;
}

export type PagesContext = EventContext<Env, string, Record<string, unknown>>;
