/**
 * Herramientas que el modelo puede PROPONER — nunca ejecutar por su cuenta.
 *
 * El modelo devuelve una intención con argumentos. Este archivo los valida,
 * los normaliza y decide si la operación procede. El modelo no ve la base de
 * datos, no escribe SQL y no puede inventar identificadores: los de grupo se
 * comprueban contra los que realmente se le ofrecieron en esta sesión.
 *
 * Cualquier campo que llegue del modelo se trata como texto de origen dudoso.
 */

import type { Env } from '../env';
import { CATALOGS } from '../validation';
import { saveParticipant, joinWaitlist } from '../services/participants';
import { searchPublishedGroups, requestGroupJoin } from '../services/groups';
import { audit } from '../audit';
import type { ChatSession, Draft } from './session';

export type ToolName =
  | 'save_participant'
  | 'search_published_groups'
  | 'request_group_join'
  | 'join_waitlist'
  | 'request_human_followup'
  | 'remember';

export interface ToolCall { name: string; args: Record<string, unknown> }

export interface ToolResult {
  /** Lo que se le devuelve al modelo para que redacte su respuesta. */
  para_el_modelo: Record<string, unknown>;
  /** Datos que la interfaz puede necesitar (por ejemplo, la lista de grupos). */
  para_la_interfaz?: Record<string, unknown>;
}

/* ─── Normalizadores ──────────────────────────────────────────────────── */

const texto = (v: unknown, max = 120): string =>
  String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);

const unoDe = (v: unknown, opciones: readonly string[]): string | undefined => {
  const s = texto(v, 40).toLowerCase();
  return opciones.includes(s) ? s : undefined;
};

const listaDe = (v: unknown, opciones: readonly string[]): string[] => {
  if (!Array.isArray(v)) return [];
  const out = new Set<string>();
  for (const x of v) { const s = unoDe(x, opciones); if (s) out.add(s); }
  return [...out];
};

/** Acepta formatos mexicanos habituales y devuelve 10 dígitos, o nada. */
export function digitosMx(v: unknown): string | undefined {
  const d = String(v ?? '').replace(/\D/g, '');
  if (d.length === 10) return d;
  if (d.length === 12 && d.startsWith('52')) return d.slice(2);
  if (d.length === 13 && d.startsWith('521')) return d.slice(3);
  if (d.length === 11 && d.startsWith('1')) return d.slice(1);
  return undefined;
}

/** 55 1234 5678 → 55 •••• 5678. Se muestra así al confirmar. */
export function enmascarar(diez: string): string {
  if (diez.length !== 10) return '••••';
  return `${diez.slice(0, 2)} •••• ${diez.slice(6)}`;
}

/* ─── Memoria de la charla ────────────────────────────────────────────── */

/**
 * `remember` no toca la base de datos: solo actualiza el borrador de la
 * sesión. Es lo que permite conversar sin registrar nada todavía.
 */
function recordar(s: ChatSession, args: Record<string, unknown>): ToolResult {
  const d: Draft = s.draft;
  const nombre = texto(args.full_name, 120);
  if (nombre) {
    d.full_name = nombre;
    d.first_name = nombre.split(/\s+/)[0];
  }
  const tel = digitosMx(args.phone);
  if (tel) d.phone = tel;

  const correo = texto(args.email, 160).toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) d.email = correo;

  const estado = texto(args.estado, 60);
  if (estado && (CATALOGS.estados as readonly string[]).includes(estado)) d.estado = estado;

  const municipio = texto(args.municipio, 90); if (municipio) d.municipio = municipio;
  const colonia = texto(args.colonia, 90);     if (colonia) d.colonia = colonia;

  const cp = String(args.postal_code ?? '').replace(/\D/g, '').slice(0, 5);
  if (cp.length === 5) d.postal_code = cp;

  const edad = unoDe(args.age_range, CATALOGS.ageRanges);        if (edad) d.age_range = edad;
  const mod = unoDe(args.pref_modality, CATALOGS.modalityPref);  if (mod) d.pref_modality = mod;
  const dias = listaDe(args.pref_weekdays, CATALOGS.weekdays);   if (dias.length) d.pref_weekdays = dias;
  const horas = listaDe(args.pref_times, CATALOGS.timeSlots);    if (horas.length) d.pref_times = horas;
  const com = unoDe(args.has_community, CATALOGS.hasCommunity);  if (com) d.has_community = com;
  const comNom = texto(args.community_name, 120);                if (comNom) d.community_name = comNom;
  const notas = texto(args.comments, 800);                       if (notas) d.comments = notas;
  const oracion = texto(args.prayer, 500);                       if (oracion) d.prayer = oracion;

  return {
    para_el_modelo: {
      ok: true,
      // Lo que ya se sabe, para que no vuelva a preguntarlo.
      conocido: {
        nombre: d.first_name ?? null,
        whatsapp: d.phone ? enmascarar(d.phone) : null,
        estado: d.estado ?? null,
        municipio: d.municipio ?? null,
        colonia: d.colonia ?? null,
        codigo_postal: d.postal_code ?? null,
        edad: d.age_range ?? null,
        modalidad: d.pref_modality ?? null,
        dias: d.pref_weekdays ?? null,
        horarios: d.pref_times ?? null,
      },
      faltan_para_registrar: faltantes(d),
    },
  };
}

/** Qué falta antes de poder registrar. El modelo lo usa para preguntar una cosa por turno. */
function faltantes(d: Draft): string[] {
  const f: string[] = [];
  if (!d.full_name || d.full_name.split(/\s+/).length < 2) f.push('nombre_y_apellido');
  if (!d.phone) f.push('whatsapp');
  if (!d.email) f.push('correo');
  if (!d.estado) f.push('estado');
  if (!d.municipio) f.push('municipio');
  if (!d.postal_code) f.push('codigo_postal');
  if (!d.colonia) f.push('colonia');
  if (!d.age_range) f.push('rango_de_edad');
  if (!d.pref_modality) f.push('modalidad');
  if (!d.has_community) f.push('pertenece_a_comunidad');
  return f;
}

/* ─── Ejecución ───────────────────────────────────────────────────────── */

export async function runTool(
  env: Env, s: ChatSession, call: ToolCall, ip: string,
): Promise<ToolResult> {
  const args = (call.args && typeof call.args === 'object') ? call.args : {};

  switch (call.name) {

    case 'remember':
      return recordar(s, args);

    /* ── Registrar ────────────────────────────────────────────────────
       Solo procede con consentimiento explícito ya registrado en la
       sesión. El modelo no puede concederlo: lo marca el orquestador
       cuando la persona lo dice con claridad.                        */
    case 'save_participant': {
      recordar(s, args);                       // por si vinieron datos nuevos
      if (!s.consentGiven) {
        return { para_el_modelo: {
          ok: false, error: 'falta_consentimiento',
          instruccion: 'Todavía no autorizó guardar sus datos. Pídeselo con tus palabras y espera un sí claro.',
        } };
      }
      const d = s.draft;
      const pendientes = faltantes(d);
      if (pendientes.length) {
        return { para_el_modelo: {
          ok: false, error: 'faltan_datos', faltan: pendientes,
          instruccion: 'Pide únicamente el primero de la lista, con naturalidad.',
        } };
      }

      const r = await saveParticipant(env, {
        full_name: d.full_name, email: d.email, phone: d.phone,
        estado: d.estado, municipio: d.municipio, postal_code: d.postal_code,
        colonia: d.colonia, pref_modality: d.pref_modality,
        pref_weekdays: d.pref_weekdays ?? [], pref_times: d.pref_times ?? [],
        age_range: d.age_range, has_community: d.has_community,
        community_name: d.community_name, comments: d.comments,
        consent_privacy: true, consent_contact: true,
      }, { ip, origen: 'chat' });

      if (!r.ok) {
        return { para_el_modelo: r.code === 'validation_failed'
          ? { ok: false, error: 'datos_invalidos', detalle: r.errors,
              instruccion: 'Explica con amabilidad qué hay que corregir y pide solo ese dato.' }
          : { ok: false, error: 'no_se_pudo_guardar',
              instruccion: 'Dile que no se pudo guardar y ofrécele continuar por WhatsApp. No afirmes que quedó registrada.' } };
      }

      s.participantId = r.participantId;
      // El borrador deja de ser necesario: los datos ya viven en `participants`.
      s.draft = {
        first_name: d.first_name, estado: d.estado, municipio: d.municipio,
        colonia: d.colonia, postal_code: d.postal_code,
        pref_modality: d.pref_modality, pref_weekdays: d.pref_weekdays,
        offered: d.offered,
      };
      // La petición de oración no se guarda con el registro: es sensible y
      // opcional. Queda solo en la nota interna de seguimiento si lo pide.
      return { para_el_modelo: {
        ok: true, registrada: true,
        instruccion: 'Confírmalo con calidez y en una sola frase. Ya puedes buscarle comunidad.',
      } };
    }

    /* ── Buscar ───────────────────────────────────────────────────────
       Lectura pública. No exige consentimiento ni registro.          */
    case 'search_published_groups': {
      recordar(s, args);
      const d = s.draft;
      const r = await searchPublishedGroups(env, {
        cp: d.postal_code, colonia: d.colonia, municipio: d.municipio, estado: d.estado,
        modalidad: d.pref_modality === 'cualquiera' ? null : d.pref_modality ?? null,
        dia: unoDe(args.dia, CATALOGS.weekdays) ?? null,
        limit: 5,
      });

      if (!r.ok) {
        return { para_el_modelo: {
          ok: false, error: 'falta_ubicacion',
          instruccion: 'Necesitas al menos su municipio, estado o código postal. Pídelo con naturalidad.',
        } };
      }

      // Se recuerda lo ofrecido: es la única forma de que "el primero" o
      // "el de los sábados" se resuelva sin que el modelo invente un id.
      d.offered = r.resultados.map((g) => ({
        id: g.id, nombre: g.nombre, lider: g.lider, zona: g.zona,
        municipio: g.municipio, estado: g.estado,
        dia: g.dia, horario: g.horario, modalidad: g.modalidad,
      }));

      return {
        para_el_modelo: {
          ok: true, total: r.resultados.length,
          // Al modelo se le manda una lista numerada SIN identificadores.
          grupos: r.resultados.map((g, i) => ({
            numero: i + 1, nombre: g.nombre,
            // Solo va si la líder autorizó mostrar su nombre público.
            ...(g.lider ? { guia: g.lider } : {}),
            zona: g.zona, municipio: g.municipio, estado: g.estado,
            modalidad: g.modalidad, dia: g.dia, horario: g.horario,
            lugares: g.lugares_disponibles,
          })),
          instruccion: r.resultados.length
            ? 'Preséntalos en prosa breve, numerados. Pregúntale cuál le acomoda.'
            : 'No hay grupos con cupo en su zona. Ofrécele la lista de espera, sin lenguaje de rechazo.',
        },
        // La interfaz pinta la tarjeta y el botón de WhatsApp con esto.
        // `id` no viaja: no le hace falta y no debe verse.
        para_la_interfaz: {
          // `numero` es lo que la interfaz devuelve al pulsar el botón: el
          // identificador real nunca sale del servidor.
          comunidades: r.resultados.map(({ id, ...visible }, i) => ({
            numero: i + 1, ...visible,
          })),
          nombre: s.draft.first_name ?? '',
        },
      };
    }

    /* ── Unirse ───────────────────────────────────────────────────────
       El identificador NUNCA lo pone el modelo: se resuelve contra la
       lista que se le ofreció en esta misma sesión.                   */
    case 'request_group_join': {
      if (!s.participantId) {
        return { para_el_modelo: {
          ok: false, error: 'no_registrada',
          instruccion: 'Antes de apartar lugar hace falta registrarla. Pide lo que falte y su autorización.',
        } };
      }
      const ofrecidos = s.draft.offered ?? [];
      if (!ofrecidos.length) {
        return { para_el_modelo: {
          ok: false, error: 'sin_busqueda_previa',
          instruccion: 'Busca grupos primero y ofrécele las opciones.',
        } };
      }

      const n = Number(args.numero);
      const elegido = Number.isInteger(n) && n >= 1 && n <= ofrecidos.length
        ? ofrecidos[n - 1]
        : null;

      if (!elegido) {
        return { para_el_modelo: {
          ok: false, error: 'eleccion_ambigua', opciones: ofrecidos.length,
          instruccion: 'No quedó claro cuál eligió. Pregúntale por el número o por el día.',
        } };
      }

      const r = await requestGroupJoin(env, elegido.id, s.participantId, ip);
      if (!r.ok) {
        if (r.code === 'group_unavailable') {
          return { para_el_modelo: {
            ok: false, error: 'grupo_lleno',
            instruccion: 'Ese grupo acaba de llenarse. Dilo sin dramatismo y ofrécele buscar de nuevo.',
          } };
        }
        return { para_el_modelo: {
          ok: false, error: 'no_se_pudo',
          instruccion: 'No se pudo apartar el lugar. No afirmes que quedó apartado; ofrécele WhatsApp.',
        } };
      }

      return {
        para_el_modelo: {
          ok: true, duplicada: r.duplicate,
          grupo: elegido.nombre, dia: elegido.dia, horario: elegido.horario,
          instruccion: r.duplicate
            ? 'Ya tenía solicitud en ese grupo. Recuérdaselo con calidez, en una frase.'
            : 'Su lugar quedó apartado. Despídete corto y cálido, con su nombre, ' +
              'y dile que la llevas con su grupo para que puedan estar en contacto.',
        },
        // La interfaz pinta el paso final: la despedida y el botón que abre
        // WhatsApp con el equipo, que hace la presentación con la líder.
        para_la_interfaz: {
          enlace: {
            nombre: s.draft.first_name ?? '',
            grupo: elegido.nombre,
            dia: elegido.dia,
            horario: elegido.horario,
            zona: elegido.zona,
          },
        },
      };
    }

    /* ── Lista de espera ──────────────────────────────────────────── */
    case 'join_waitlist': {
      if (!s.participantId) {
        return { para_el_modelo: {
          ok: false, error: 'no_registrada',
          instruccion: 'Para anotarla en la lista hace falta registrarla antes.',
        } };
      }
      const r = await joinWaitlist(env, s.participantId, ip);
      return { para_el_modelo: r.ok
        ? { ok: true, instruccion: 'Confírmalo con calidez: le avisarán en cuanto abra un grupo cerca.' }
        : { ok: false, error: 'no_se_pudo', instruccion: 'No afirmes que quedó anotada. Ofrécele WhatsApp.' } };
    }

    /* ── Escalar a una persona ────────────────────────────────────── */
    case 'request_human_followup': {
      s.escalated = true;
      const motivo = texto(args.motivo, 200);
      await audit(env, {
        actorType: 'public', action: 'chat.human_followup',
        entityType: s.participantId ? 'participant' : 'chat_session',
        entityId: s.participantId ?? s.id,
        after: { motivo: motivo || 'sin especificar' }, ip,
      });
      return { para_el_modelo: {
        ok: true,
        instruccion: 'Dile que alguien del equipo la va a buscar y ofrécele también escribir por WhatsApp ahora mismo.',
      } };
    }

    default:
      return { para_el_modelo: { ok: false, error: 'herramienta_desconocida' } };
  }
}
