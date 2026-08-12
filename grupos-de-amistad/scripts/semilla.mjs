/**
 * Grupos de prueba, para ver el flujo funcionando antes de que existan
 * comunidades reales.
 *
 *   npm run seed        crea tres grupos publicados en la base LOCAL
 *   npm run seed:limpiar los borra
 *
 * Importante: esto **no** es un atajo a la aprobación. Cada grupo se crea
 * con su solicitud, su líder y su aprobación pastoral registrada, igual
 * que si hubiera pasado por el proceso completo. Lo único que se salta es
 * la espera. Los identificadores llevan el prefijo `seed-` para poder
 * borrarlos sin tocar nada más.
 *
 * Solo actúa sobre la base local (--local). Nunca sobre producción.
 */

import { execFileSync } from 'node:child_process';

const BASE = 'lbyn-grupos';
const ahora = new Date().toISOString();

const GRUPOS = [
  {
    id: 'coyoacan', grupo: 'Mesa de Coyoacán', lider: 'Andrea',
    estado: 'Ciudad de México', municipio: 'Coyoacán', cp: '04100',
    colonia: 'Del Carmen', zona: 'A dos calles del Jardín Centenario',
    modalidad: 'presencial', dia: 'sabado', hora: '10:00', cupo: 8,
  },
  {
    id: 'neza', grupo: 'Mesa de Nezahualcóyotl', lider: 'Paty',
    estado: 'Estado de México', municipio: 'Nezahualcóyotl', cp: '57000',
    colonia: 'Benito Juárez', zona: 'Cerca del mercado',
    modalidad: 'presencial', dia: 'miercoles', hora: '19:00', cupo: 10,
  },
  {
    id: 'linea', grupo: 'Mesa en línea', lider: 'Sofía',
    estado: 'Ciudad de México', municipio: 'En línea', cp: '06000',
    colonia: 'En línea', zona: 'Nos vemos por videollamada',
    modalidad: 'linea', dia: 'jueves', hora: '20:30', cupo: 12,
  },
];

function sql(consulta) {
  execFileSync('npx', ['wrangler', 'd1', 'execute', BASE, '--local', '--command', consulta],
    { stdio: 'inherit' });
}

const esc = (v) => `'${String(v).replace(/'/g, "''")}'`;

if (process.argv[2] === 'limpiar') {
  sql(`DELETE FROM groups WHERE id LIKE 'seed-%';
       DELETE FROM group_applications WHERE id LIKE 'seed-%';
       DELETE FROM pastoral_approvals WHERE application_id LIKE 'seed-%';
       DELETE FROM leaders WHERE id LIKE 'seed-%';`);
  console.log('✓ grupos de prueba borrados');
  process.exit(0);
}

for (const g of GRUPOS) {
  const l = `seed-lider-${g.id}`;
  const a = `seed-app-${g.id}`;
  const s = `seed-grupo-${g.id}`;

  sql(`
    INSERT OR REPLACE INTO leaders
      (id, full_name, public_name, public_name_authorized, email, email_normalized,
       email_hash, phone_e164, phone_hash, church_type, created_at, updated_at)
    VALUES (${esc(l)}, ${esc(g.lider + ' (prueba)')}, ${esc(g.lider)}, 1,
       ${esc(g.id + '@ejemplo.mx')}, ${esc(g.id + '@ejemplo.mx')}, ${esc('seed-' + g.id)},
       '+525500000000', ${esc('seedtel-' + g.id)}, 'otra', ${esc(ahora)}, ${esc(ahora)});

    INSERT OR REPLACE INTO group_applications
      (id, leader_id, folio, idempotency_key, status, group_name, estado, municipio,
       postal_code, colonia, zone_public, address_private, modality, weekday,
       time_start, capacity, motivation, consent_version, consent_accepted_at,
       agreement_version, created_at, updated_at)
    VALUES (${esc(a)}, ${esc(l)}, ${esc('SEED-' + g.id.toUpperCase())}, ${esc('seed-' + g.id)},
       'PUBLISHED', ${esc(g.grupo)}, ${esc(g.estado)}, ${esc(g.municipio)}, ${esc(g.cp)},
       ${esc(g.colonia)}, ${esc(g.zona)}, 'Domicilio de prueba', ${esc(g.modalidad)},
       ${esc(g.dia)}, ${esc(g.hora)}, ${g.cupo},
       'Grupo de prueba para ver el flujo funcionando.',
       '2026-08-v1', ${esc(ahora)}, '2026-08-v1', ${esc(ahora)}, ${esc(ahora)});

    INSERT OR REPLACE INTO pastoral_approvals
      (id, application_id, token_hash, sent_to, responder_name, decision,
       sent_at, used_at, expires_at, created_at)
    VALUES (${esc('seed-pas-' + g.id)}, ${esc(a)}, ${esc('seedtok-' + g.id)},
       ${esc('seedmail-' + g.id)}, 'Pastorado (prueba)', 'approved',
       ${esc(ahora)}, ${esc(ahora)}, ${esc(ahora)}, ${esc(ahora)});

    INSERT OR REPLACE INTO groups
      (id, application_id, leader_id, editorial_status, is_visible, is_active,
       public_name, estado, municipio, postal_code, colonia, zone_public,
       address_private, modality, weekday, time_start, capacity, occupied,
       published_at, created_at, updated_at)
    VALUES (${esc(s)}, ${esc(a)}, ${esc(l)}, 'PUBLISHED', 1, 1,
       ${esc(g.grupo)}, ${esc(g.estado)}, ${esc(g.municipio)}, ${esc(g.cp)},
       ${esc(g.colonia)}, ${esc(g.zona)}, 'Domicilio de prueba', ${esc(g.modalidad)},
       ${esc(g.dia)}, ${esc(g.hora)}, ${g.cupo}, 0,
       ${esc(ahora)}, ${esc(ahora)}, ${esc(ahora)});
  `);
  console.log(`✓ ${g.grupo} — CP ${g.cp}`);
}

console.log('\nProbar con los códigos postales 04100, 57000 o 06000.');
console.log('Para borrarlos:  npm run seed:limpiar');
