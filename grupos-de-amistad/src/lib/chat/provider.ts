/**
 * Adaptador del proveedor del modelo.
 *
 * La clave vive en un secreto de Cloudflare y NUNCA sale de este Worker.
 * El navegador habla con /api/chat/message; jamás con el proveedor.
 *
 * Proveedor y modelo se eligen por variable de entorno. No hay credenciales
 * escritas en el código ni valores por omisión que apunten a una cuenta real.
 *
 *   CHAT_PROVIDER   "anthropic" | "openai" | "workers-ai"
 *   CHAT_MODEL      identificador del modelo, tal cual lo pide el proveedor
 *   CHAT_API_KEY    secreto (no hace falta con workers-ai)
 *   AI              binding de Workers AI (solo si CHAT_PROVIDER = workers-ai)
 */

import type { Env } from '../env';

export interface Mensaje { role: 'user' | 'assistant'; content: string }

export interface RespuestaModelo {
  /** Texto para la persona. Puede ir vacío si solo pidió una herramienta. */
  texto: string;
  /** Herramientas que propone ejecutar. El servidor decide si proceden. */
  herramientas: { name: string; args: Record<string, unknown> }[];
}

export class ProviderNoConfigurado extends Error {}
export class ProviderFallo extends Error {}

const TIMEOUT_MS = 20_000;

/** Esquema de herramientas, en el formato de cada proveedor. */
const HERRAMIENTAS = [
  {
    name: 'remember',
    description:
      'Guarda en la memoria de la charla lo que la persona acaba de compartir. ' +
      'Úsala siempre que aparezca un dato nuevo, aunque no vayas a registrar todavía. No escribe en la base de datos.',
    properties: {
      full_name: { type: 'string', description: 'Nombre completo tal como lo dijo.' },
      phone: { type: 'string', description: 'WhatsApp tal como lo escribió.' },
      email: { type: 'string' },
      estado: { type: 'string', description: 'Estado de la República, nombre completo.' },
      municipio: { type: 'string' },
      colonia: { type: 'string' },
      postal_code: { type: 'string' },
      age_range: { type: 'string', enum: ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'] },
      pref_modality: { type: 'string', enum: ['presencial', 'linea', 'cualquiera'] },
      pref_weekdays: { type: 'array', items: { type: 'string' } },
      pref_times: { type: 'array', items: { type: 'string', enum: ['manana', 'tarde', 'noche'] } },
      has_community: { type: 'string', enum: ['si', 'no', 'antes'] },
      community_name: { type: 'string' },
      comments: { type: 'string' },
      prayer: { type: 'string', description: 'Petición de oración, solo si la compartió por voluntad propia.' },
    },
    required: [],
  },
  {
    name: 'save_participant',
    description:
      'Registra a la persona. Solo después de que autorizó explícitamente guardar sus datos y de tener todo lo necesario.',
    properties: {},
    required: [],
  },
  {
    name: 'search_published_groups',
    description:
      'Busca grupos de amistad publicados y con cupo cerca de donde vive. No requiere registro previo.',
    properties: { dia: { type: 'string', description: 'Día concreto, si lo pidió.' } },
    required: [],
  },
  {
    name: 'request_group_join',
    description:
      'Aparta su lugar en uno de los grupos que ya le ofreciste. Indica el NÚMERO de la lista que le mostraste.',
    properties: { numero: { type: 'integer', description: 'Número del grupo en la lista ofrecida.' } },
    required: ['numero'],
  },
  {
    name: 'join_waitlist',
    description: 'La anota en la lista de espera cuando no hay grupos con cupo en su zona.',
    properties: {},
    required: [],
  },
  {
    name: 'request_human_followup',
    description:
      'Pide que una persona del equipo la contacte. Úsala ante crisis, riesgo, abuso, o cuando ella lo pida.',
    properties: { motivo: { type: 'string' } },
    required: [],
  },
] as const;

function esquemaJson(h: (typeof HERRAMIENTAS)[number]) {
  return { type: 'object', properties: h.properties, required: [...h.required] };
}

async function conTiempo(p: Promise<Response>): Promise<Response> {
  const t = new Promise<never>((_, rej) =>
    setTimeout(() => rej(new ProviderFallo('timeout')), TIMEOUT_MS));
  return Promise.race([p, t]);
}

export async function pedirRespuesta(
  env: Env, sistema: string, mensajes: Mensaje[],
): Promise<RespuestaModelo> {
  const proveedor = (env.CHAT_PROVIDER ?? '').trim().toLowerCase();
  const modelo = (env.CHAT_MODEL ?? '').trim();

  if (!proveedor || !modelo) throw new ProviderNoConfigurado('falta CHAT_PROVIDER o CHAT_MODEL');
  if (proveedor !== 'workers-ai' && !env.CHAT_API_KEY) {
    throw new ProviderNoConfigurado('falta el secreto CHAT_API_KEY');
  }

  if (proveedor === 'anthropic') return anthropic(env, modelo, sistema, mensajes);
  if (proveedor === 'openai') return openai(env, modelo, sistema, mensajes);
  if (proveedor === 'workers-ai') return workersAi(env, modelo, sistema, mensajes);
  throw new ProviderNoConfigurado(`proveedor no soportado: ${proveedor}`);
}

/* ─── Anthropic ───────────────────────────────────────────────────────── */
async function anthropic(
  env: Env, modelo: string, sistema: string, mensajes: Mensaje[],
): Promise<RespuestaModelo> {
  const res = await conTiempo(fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.CHAT_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: modelo, max_tokens: 700, system: sistema, messages: mensajes,
      tools: HERRAMIENTAS.map((h) => ({
        name: h.name, description: h.description, input_schema: esquemaJson(h),
      })),
    }),
  }));

  if (!res.ok) throw new ProviderFallo(`anthropic ${res.status}`);
  const data = await res.json<any>();

  let texto = '';
  const herramientas: RespuestaModelo['herramientas'] = [];
  for (const bloque of data.content ?? []) {
    if (bloque.type === 'text') texto += bloque.text;
    if (bloque.type === 'tool_use') herramientas.push({ name: bloque.name, args: bloque.input ?? {} });
  }
  return { texto: texto.trim(), herramientas };
}

/* ─── OpenAI ──────────────────────────────────────────────────────────── */
async function openai(
  env: Env, modelo: string, sistema: string, mensajes: Mensaje[],
): Promise<RespuestaModelo> {
  const res = await conTiempo(fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.CHAT_API_KEY}` },
    body: JSON.stringify({
      model: modelo, max_tokens: 700,
      messages: [{ role: 'system', content: sistema }, ...mensajes],
      tools: HERRAMIENTAS.map((h) => ({
        type: 'function',
        function: { name: h.name, description: h.description, parameters: esquemaJson(h) },
      })),
    }),
  }));

  if (!res.ok) throw new ProviderFallo(`openai ${res.status}`);
  const data = await res.json<any>();
  const m = data.choices?.[0]?.message ?? {};

  const herramientas: RespuestaModelo['herramientas'] = [];
  for (const c of m.tool_calls ?? []) {
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(c.function?.arguments ?? '{}'); } catch { args = {}; }
    herramientas.push({ name: c.function?.name ?? '', args });
  }
  return { texto: String(m.content ?? '').trim(), herramientas };
}

/* ─── Workers AI ──────────────────────────────────────────────────────── */
async function workersAi(
  env: Env, modelo: string, sistema: string, mensajes: Mensaje[],
): Promise<RespuestaModelo> {
  if (!env.AI) throw new ProviderNoConfigurado('falta el binding AI');
  const data: any = await env.AI.run(modelo, {
    messages: [{ role: 'system', content: sistema }, ...mensajes],
    tools: HERRAMIENTAS.map((h) => ({
      name: h.name, description: h.description, parameters: esquemaJson(h),
    })),
    max_tokens: 700,
  });

  const herramientas: RespuestaModelo['herramientas'] = [];
  for (const c of data?.tool_calls ?? []) {
    const args = typeof c.arguments === 'string'
      ? (() => { try { return JSON.parse(c.arguments); } catch { return {}; } })()
      : (c.arguments ?? {});
    herramientas.push({ name: c.name ?? '', args });
  }
  return { texto: String(data?.response ?? '').trim(), herramientas };
}
