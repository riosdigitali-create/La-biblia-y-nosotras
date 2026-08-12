/**
 * Plantillas de mensaje.
 *
 * El tono es pastoral y cálido, sin promesas espirituales exageradas
 * y sin manipulación emocional.
 *
 * [PENDIENTE: aprobación de contenido] — todo este texto debe revisarse
 * y aprobarse antes de habilitar el envío real. No se ha publicado nada.
 */

export interface Built { subject: string; text: string; }

export type TemplateKey =
  | 'application_received' | 'pastoral_request' | 'corrections_requested'
  | 'group_published' | 'join_request' | 'waitlist';

interface Template { build(v: Record<string, string>): Built; }

export const TEMPLATES: Record<TemplateKey, Template> = {
  application_received: {
    build: (v) => ({
      subject: `Recibimos tu solicitud · ${v.folio}`,
      text: `Hola ${v.nombre}:

Tu solicitud fue recibida correctamente. Tu folio es ${v.folio}.

El grupo todavía no está activo ni publicado. Nuestro equipo revisará la
información y solicitará la confirmación correspondiente antes de aprobarlo.

Te escribiremos en cuanto tengamos noticias.

La Biblia y Nosotras`,
    }),
  },

  pastoral_request: {
    build: (v) => ({
      subject: 'Confirmación pastoral para un grupo de amistad',
      text: `Estimados ${v.pastores}:

${v.lider} solicitó abrir un grupo de amistad de La Biblia y Nosotras y
nos autorizó a pedirles su confirmación.

Pueden revisar la solicitud y responder aquí:
${v.enlace}

El enlace es de un solo uso y vence en siete días. No da acceso a ningún
panel ni a información privada.

Su respuesta no publica el grupo: después de su confirmación, nuestro
equipo hace una aprobación final.

Gracias por su tiempo.

La Biblia y Nosotras`,
    }),
  },

  corrections_requested: {
    build: (v) => ({
      subject: `Necesitamos un dato más · ${v.folio}`,
      text: `Hola ${v.nombre}:

Revisamos tu solicitud ${v.folio} y necesitamos que nos ayudes con esto:

${v.notas}

En cuanto lo tengamos, seguimos con el proceso.

La Biblia y Nosotras`,
    }),
  },

  group_published: {
    build: (v) => ({
      subject: 'Tu grupo de amistad ya está publicado',
      text: `Hola ${v.nombre}:

Tu grupo quedó aprobado y ya aparece para que otras mujeres puedan
encontrarlo. Te avisaremos cada vez que alguien solicite unirse.

Gracias por abrir tu mesa.

La Biblia y Nosotras`,
    }),
  },

  join_request: {
    build: (v) => ({
      subject: 'Alguien quiere unirse a tu grupo',
      text: `Hola ${v.nombre}:

${v.participante} solicitó unirse a tu grupo. Nuestro equipo se pondrá en
contacto contigo para coordinar los siguientes pasos.

La Biblia y Nosotras`,
    }),
  },

  waitlist: {
    build: () => ({
      subject: 'Te tenemos presente',
      text: `Hola:

Todavía no encontramos un grupo disponible en tu zona. Tus datos quedaron
registrados y te contactaremos cuando se abra una opción cercana.

La Biblia y Nosotras`,
    }),
  },
};
