/**
 * Validación estricta en servidor. El navegador no es fuente de confianza.
 * Los mensajes se redactan como instrucción, no como reproche.
 */

export type Errors = Record<string, string>;

export interface Field {
  key: string;
  label: string;
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: RegExp;
  oneOf?: readonly string[];
  message?: string;
}

const ESTADOS_MX = [
  'Aguascalientes','Baja California','Baja California Sur','Campeche','Chiapas','Chihuahua',
  'Ciudad de México','Coahuila','Colima','Durango','Estado de México','Guanajuato','Guerrero',
  'Hidalgo','Jalisco','Michoacán','Morelos','Nayarit','Nuevo León','Oaxaca','Puebla','Querétaro',
  'Quintana Roo','San Luis Potosí','Sinaloa','Sonora','Tabasco','Tamaulipas','Tlaxcala','Veracruz',
  'Yucatán','Zacatecas',
] as const;

export const CATALOGS = {
  estados: ESTADOS_MX,
  weekdays: ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'] as const,
  modality: ['presencial','linea'] as const,
  modalityPref: ['presencial','linea','cualquiera'] as const,
  churchType: ['rio','otra','sin_iglesia'] as const,
  ageRanges: ['18-24','25-34','35-44','45-54','55-64','65+'] as const,
  timeSlots: ['manana','tarde','noche'] as const,
  hasCommunity: ['si','no','antes'] as const,
};

export function normalizeEmail(v: string): string {
  return v.trim().toLowerCase();
}

/** Devuelve E.164 mexicano o null. Acepta 10 dígitos o +52. */
export function normalizePhone(v: string): string | null {
  const d = String(v ?? '').replace(/\D/g, '');
  if (d.length === 10) return `+52${d}`;
  if (d.length === 12 && d.startsWith('52')) return `+${d}`;
  if (d.length === 13 && d.startsWith('521')) return `+52${d.slice(3)}`;
  return null;
}

export function validate(data: Record<string, unknown>, fields: Field[]): Errors {
  const errors: Errors = {};
  for (const f of fields) {
    const raw = data[f.key];
    const v = typeof raw === 'string' ? raw.trim() : raw;

    if (f.required && (v === undefined || v === null || v === '')) {
      errors[f.key] = f.message ?? `${f.label} es obligatorio.`;
      continue;
    }
    if (v === undefined || v === null || v === '') continue;

    if (typeof v === 'string') {
      if (f.min && v.length < f.min) {
        errors[f.key] = `${f.label} debe tener al menos ${f.min} caracteres.`;
        continue;
      }
      if (f.max && v.length > f.max) {
        errors[f.key] = `${f.label} no puede pasar de ${f.max} caracteres.`;
        continue;
      }
      if (f.pattern && !f.pattern.test(v)) {
        errors[f.key] = f.message ?? `Revisa el formato de ${f.label.toLowerCase()}.`;
        continue;
      }
      if (f.oneOf && !f.oneOf.includes(v)) {
        errors[f.key] = `Elige una opción válida en ${f.label.toLowerCase()}.`;
        continue;
      }
    }
  }
  return errors;
}

export const RE = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  postal: /^\d{5}$/,
  time: /^([01]\d|2[0-3]):[0-5]\d$/,
  name: /^[\p{L}\p{M}'’.\- ]{2,120}$/u,
};

/** Dos palabras de dos o más letras. */
export function isFullName(v: string): boolean {
  return v.trim().split(/\s+/).filter((p) => p.length >= 2).length >= 2;
}

export const LEADER_FIELDS: Field[] = [
  { key: 'full_name',  label: 'Nombre completo', required: true, min: 5, max: 120, pattern: RE.name },
  { key: 'email',      label: 'Correo',          required: true, max: 160, pattern: RE.email,
    message: 'Escribe un correo con este formato: tu@correo.com' },
  { key: 'phone',      label: 'WhatsApp',        required: true },
  { key: 'estado',     label: 'Estado',          required: true, oneOf: CATALOGS.estados },
  { key: 'municipio',  label: 'Municipio o ciudad', required: true, min: 2, max: 90 },
  { key: 'postal_code',label: 'Código postal',   required: true, pattern: RE.postal,
    message: 'Escribe el código postal de 5 dígitos.' },
  { key: 'colonia',    label: 'Colonia',         required: true, min: 2, max: 90 },
  { key: 'zone_public',label: 'Zona aproximada', required: true, min: 3, max: 90 },
  { key: 'modality',   label: 'Modalidad',       required: true, oneOf: CATALOGS.modality },
  { key: 'weekday',    label: 'Día de reunión',  required: true, oneOf: CATALOGS.weekdays },
  { key: 'time_start', label: 'Horario',         required: true, pattern: RE.time,
    message: 'Escribe la hora en formato de 24 horas, por ejemplo 18:30.' },
  { key: 'group_name', label: 'Nombre del grupo', max: 80 },
  { key: 'church_type',label: 'Iglesia',         required: true, oneOf: CATALOGS.churchType },
  { key: 'church_name',label: 'Nombre de la iglesia', max: 120 },
  { key: 'pastors_name', label: 'Nombre de sus pastores', max: 120 },
  { key: 'pastoral_contact', label: 'Contacto pastoral', max: 160 },
  { key: 'motivation', label: 'Motivo para abrir el grupo', required: true, min: 20, max: 1200,
    message: 'Cuéntanos en unas líneas por qué quieres abrir tu mesa (mínimo 20 caracteres).' },
  { key: 'comments',   label: 'Comentarios', max: 1200 },
];

export const PARTICIPANT_FIELDS: Field[] = [
  { key: 'full_name',   label: 'Nombre completo', required: true, min: 5, max: 120, pattern: RE.name },
  { key: 'email',       label: 'Correo',   required: true, max: 160, pattern: RE.email },
  { key: 'phone',       label: 'WhatsApp', required: true },
  { key: 'estado',      label: 'Estado',   required: true, oneOf: CATALOGS.estados },
  { key: 'municipio',   label: 'Municipio o ciudad', required: true, min: 2, max: 90 },
  { key: 'postal_code', label: 'Código postal', required: true, pattern: RE.postal },
  { key: 'colonia',     label: 'Colonia',  required: true, min: 2, max: 90 },
  { key: 'pref_modality', label: 'Modalidad preferida', required: true, oneOf: CATALOGS.modalityPref },
  { key: 'age_range',   label: 'Edad', required: true, oneOf: CATALOGS.ageRanges },
  { key: 'has_community', label: '¿Ya perteneces a una comunidad?', required: true, oneOf: CATALOGS.hasCommunity },
  { key: 'community_name', label: 'Nombre de la comunidad o de tu líder', max: 120 },
  { key: 'comments',    label: 'Comentarios', max: 800 },
];
