/**
 * Círculos de amigas.
 *
 *   node --experimental-sqlite tests/circulos.mjs
 *
 * Corre el servicio de verdad contra SQLite con las migraciones reales.
 * No hay dobles ni simulaciones: si una regla no se cumple aquí, no se
 * cumple en producción.
 */

import { nuevoEntorno, ok, igual, seccion, resumen } from './arnes.mjs';
import { openCircle, resumenCirculos, clave, UMBRALES_AVISO }
  from '../dist/lib/services/circles.js';

const { env, db } = nuevoEntorno();

const base = {
  full_name: 'Ana María Pérez',
  email: 'ana@ejemplo.mx',
  phone: '5512345678',
  church_name: 'Iglesia RÍO México',
  city: 'Ciudad de México',
  consent_privacy: true,
  consent_contact: true,
};

/* ─── La clave de agrupación ─────────────────────────────────────── */

seccion('Agrupar iglesias escritas de formas distintas');

igual(clave('Iglesia RÍO México'), clave('rio mexico'),
  'Con y sin la palabra «iglesia», acentos y mayúsculas, es la misma');
igual(clave('IGLESIA RIO MEXICO'), clave('  Río   México '),
  'Los espacios de más y las mayúsculas no cuentan');
igual(clave('Centro Cristiano Vida'), clave('vida'),
  '«Centro Cristiano» no distingue nada, así que no entra en la clave');
ok(clave('Río México') !== clave('Río Guadalajara'),
  'Dos iglesias distintas no se confunden');
ok(clave('La Comunidad').length > 0,
  'Una iglesia hecha sólo de palabras vacías conserva una clave');

/* ─── Abrir un círculo ───────────────────────────────────────────── */

seccion('Abrir un círculo');

const r1 = await openCircle(env, base);
ok(r1.ok, 'Se abre con los cinco campos obligatorios');
ok(r1.ok && /^C-\d{4}-\d{6}$/.test(r1.folio), 'Devuelve un folio con formato');
ok(r1.ok && r1.returning === false, 'La primera vez no es un regreso');

const guardado = db.prepare(
  `SELECT * FROM circles WHERE folio = ?`).get(r1.ok ? r1.folio : '');
ok(guardado, 'Quedó guardado en la base');
igual(guardado.church_key, clave('Iglesia RÍO México'), 'Guarda la clave de la iglesia');
igual(guardado.city_key, clave('Ciudad de México'), 'Guarda la clave de la ciudad');
igual(guardado.circle_name, null, 'El nombre del círculo es opcional');
igual(guardado.approx_size, null, 'El número de participantes es opcional');
ok(!('address' in guardado), 'No se guarda ninguna dirección');

/* ─── Los dos campos opcionales ──────────────────────────────────── */

seccion('Los campos opcionales');

const r2 = await openCircle(env, {
  ...base, email: 'lupe@ejemplo.mx', phone: '5512345679',
  circle_name: 'Las de los martes', approx_size: '8',
});
ok(r2.ok, 'Se abre con nombre y número');
const c2 = db.prepare(`SELECT * FROM circles WHERE folio = ?`).get(r2.ok ? r2.folio : '');
igual(c2.circle_name, 'Las de los martes', 'Guarda el nombre del círculo');
igual(c2.approx_size, 8, 'Guarda el número aproximado');

const r3 = await openCircle(env, {
  ...base, email: 'sara@ejemplo.mx', phone: '5512345680', approx_size: '9999',
});
const c3 = db.prepare(`SELECT * FROM circles WHERE folio = ?`).get(r3.ok ? r3.folio : '');
igual(c3.approx_size, 200, 'Un número desmedido se recorta al máximo');

/* ─── Lo que no se acepta ────────────────────────────────────────── */

seccion('Validación');

const sinApellido = await openCircle(env, { ...base, email: 'x1@ejemplo.mx', full_name: 'Ana' });
ok(!sinApellido.ok && sinApellido.errors?.full_name, 'Pide nombre y apellido');

const malCorreo = await openCircle(env, { ...base, email: 'no-es-correo' });
ok(!malCorreo.ok && malCorreo.errors?.email, 'Rechaza un correo mal escrito');

const malTel = await openCircle(env, { ...base, email: 'x2@ejemplo.mx', phone: '123' });
ok(!malTel.ok && malTel.errors?.phone, 'Rechaza un teléfono corto');

const sinIglesia = await openCircle(env, { ...base, email: 'x3@ejemplo.mx', church_name: '' });
ok(!sinIglesia.ok && sinIglesia.errors?.church_name, 'La iglesia es obligatoria');

const sinCiudad = await openCircle(env, { ...base, email: 'x4@ejemplo.mx', city: '' });
ok(!sinCiudad.ok && sinCiudad.errors?.city, 'La ciudad es obligatoria');

const sinPermiso = await openCircle(env, { ...base, email: 'x5@ejemplo.mx', consent_privacy: false });
ok(!sinPermiso.ok && sinPermiso.errors?.consent_privacy, 'Sin autorización no se guarda');

const sinContacto = await openCircle(env, { ...base, email: 'x6@ejemplo.mx', consent_contact: false });
ok(!sinContacto.ok && sinContacto.errors?.consent_contact, 'Sin permiso de contacto tampoco');

const antes = db.prepare(`SELECT COUNT(*) AS n FROM circles`).get().n;
await openCircle(env, { ...base, email: 'x7@ejemplo.mx', full_name: 'Ana' });
igual(db.prepare(`SELECT COUNT(*) AS n FROM circles`).get().n, antes,
  'Un registro rechazado no escribe nada');

/* ─── Enviar dos veces ───────────────────────────────────────────── */

seccion('La misma persona dos veces');

const total1 = db.prepare(`SELECT COUNT(*) AS n FROM circles`).get().n;
const repe = await openCircle(env, { ...base, circle_name: 'Las de siempre' });
ok(repe.ok && repe.returning === true, 'El mismo correo devuelve «regreso»');
igual(repe.ok ? repe.folio : '', r1.ok ? r1.folio : '', 'Conserva el folio original');
igual(db.prepare(`SELECT COUNT(*) AS n FROM circles`).get().n, total1,
  'No se crea un segundo registro');
igual(db.prepare(`SELECT circle_name FROM circles WHERE folio = ?`).get(r1.folio).circle_name,
  'Las de siempre', 'Los datos nuevos sí se actualizan');

/* ─── El aviso a las pastoras ────────────────────────────────────── */

seccion('Aviso cuando una iglesia junta varias');

/* Una iglesia nueva y limpia, para contar sin arrastrar lo anterior. */
const IGLESIA = 'Iglesia Monte Alto';
const kMonte = clave(IGLESIA);

function avisos(k) {
  return db.prepare(
    `SELECT * FROM church_alerts WHERE church_key = ? ORDER BY threshold`).all(k);
}
async function abrirEn(iglesia, n) {
  for (let i = 0; i < n; i++) {
    await openCircle(env, {
      ...base, church_name: iglesia,
      email: `${clave(iglesia)}-${Date.now()}-${i}@ejemplo.mx`,
      phone: '55' + String(10000000 + i),
    });
  }
}

await abrirEn(IGLESIA, 2);
igual(avisos(kMonte).length, 0, 'Con dos círculos todavía no hay aviso');

await abrirEn(IGLESIA, 1);                       /* van 3 */
const av = avisos(kMonte);
igual(av.length, 1, 'Al tercer círculo se levanta el aviso');
igual(av[0].threshold, UMBRALES_AVISO[0], 'Con el primer umbral');
igual(av[0].status, 'PENDING', 'Queda pendiente, no enviado');
igual(av[0].circles_count, 3, 'Con la cuenta del momento');

await abrirEn(IGLESIA, 1);                       /* van 4 */
igual(avisos(kMonte).length, 1, 'La cuarta no repite el mismo umbral');

await abrirEn(IGLESIA, 1);                       /* van 5 */
const av2 = avisos(kMonte);
igual(av2.length, 2, 'La quinta cruza el segundo umbral y levanta otro aviso');
igual(av2[1].threshold, UMBRALES_AVISO[1], 'El segundo umbral es el que toca');

await abrirEn(IGLESIA, 1);                       /* van 6 */
igual(avisos(kMonte).length, 2, 'Y no se repite tampoco');

/* Una iglesia distinta no arrastra el aviso de la otra. */
await openCircle(env, {
  ...base, email: 'otra@ejemplo.mx', phone: '5512345683',
  church_name: 'Iglesia Vida Nueva', city: 'Guadalajara',
});
igual(avisos(clave('Iglesia Vida Nueva')).length, 0,
  'Una iglesia con un solo círculo no genera aviso');

/* ─── Lo que ve el panel ─────────────────────────────────────────── */

seccion('El resumen del panel');

const res = await resumenCirculos(env);
ok(res.total >= 5, 'Cuenta el total de círculos');
ok(res.porIglesia.length >= 2, 'Agrupa por iglesia');
igual(res.porIglesia[0].iglesia, IGLESIA, 'La iglesia con más círculos va primero');
igual(res.porIglesia[0].n, 6, 'Con su cuenta exacta');
ok(res.porCiudad.length >= 2, 'Agrupa por ciudad');
/* Monte Alto cruzó dos umbrales y RÍO México uno: tres avisos. */
igual(res.avisos.length,
  db.prepare(`SELECT COUNT(*) AS n FROM church_alerts WHERE status = 'PENDING'`).get().n,
  'Muestra todos los avisos pendientes de la base');
igual(res.avisos.filter((a) => a.iglesia === IGLESIA).length, 2,
  'Los dos umbrales de la iglesia con más círculos');
igual(res.sinSeguimiento, res.total, 'Todos están sin seguimiento todavía');

/* Las escritas distinto se cuentan juntas. */
await openCircle(env, {
  ...base, email: 'variante@ejemplo.mx', phone: '5512345684',
  church_name: 'RIO MEXICO', city: 'CDMX',
});
const res2 = await resumenCirculos(env);
const rio = res2.porIglesia.find((x) => x.clave === clave('Iglesia RÍO México'));
ok(rio && rio.n >= 4, 'Escribir «RIO MEXICO» suma a la misma iglesia');

/* ─── Lo que no se toca ──────────────────────────────────────────── */

seccion('El camino viejo sigue entero');

ok(db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='group_applications'`).get(),
  'La tabla de solicitudes completas sigue existiendo');
ok(db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='groups'`).get(),
  'La tabla de grupos publicados sigue existiendo');

resumen();
