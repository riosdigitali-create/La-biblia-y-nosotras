/**
 * Arnés de pruebas de extremo a extremo.
 *
 * Corre el código real —los servicios, la máquina de estados, el SQL— contra
 * una base SQLite en memoria con las migraciones de verdad aplicadas. No hay
 * simulacros de la lógica: solo se sustituye el transporte (D1 y Queues) por
 * un equivalente local.
 *
 *   node --experimental-sqlite tests/e2e.mjs
 */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
if (!globalThis.crypto) globalThis.crypto = webcrypto;

/* ─── D1 sobre node:sqlite ────────────────────────────────────────────
   Se implementa la superficie que usa la aplicación: prepare().bind()
   .run() / .first() / .all(), y batch(). Nada más, y nada distinto.   */

class Stmt {
  constructor(db, sql) { this.db = db; this.sql = sql; this.binds = []; }
  bind(...args) { const s = new Stmt(this.db, this.sql); s.binds = args.map(norm); return s; }
  run() {
    const r = this.db.prepare(this.sql).run(...this.binds);
    return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
  first() { const r = this.db.prepare(this.sql).get(...this.binds); return r ?? null; }
  all() { return { results: this.db.prepare(this.sql).all(...this.binds), success: true }; }
}
function norm(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}
class D1 {
  constructor(db) { this.db = db; }
  prepare(sql) { return new Stmt(this.db, sql); }
  async batch(stmts) {
    this.db.exec('BEGIN');
    try { const out = stmts.map((s) => s.run()); this.db.exec('COMMIT'); return out; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
}

/* ─── Entorno ─────────────────────────────────────────────────────── */

export function nuevoEntorno(overrides = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');

  const dir = join(raiz, 'migrations');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(dir, f), 'utf8');
    try { db.exec(sql); }
    catch (e) { throw new Error(`migración ${f}: ${e.message}`); }
  }

  const encolados = [];
  return {
    db,
    encolados,
    env: {
      DB: new D1(db),
      JOBS: { send: async (m) => { encolados.push(m); } },
      FILES: null,
      APP_NAME: 'test',
      APP_ORIGIN: 'https://lbyn-grupos.pages.dev',
      CONSENT_VERSION: '2026-08-v1',
      AGREEMENT_VERSION: '2026-08-v1',
      ADMIN_AUTH_MODE: 'password',
      ACCESS_TEAM_DOMAIN: '', ACCESS_AUD: '',
      EMAIL_ENABLED: 'false', EMAIL_FROM: '',
      WHATSAPP_ENABLED: 'false',
      SESSION_PEPPER: 'pimienta-de-prueba-sesion',
      HASH_PEPPER: 'pimienta-de-prueba-hash',
      TURNSTILE_SECRET_KEY: '',
      CHAT_PROVIDER: '', CHAT_MODEL: '', CHAT_WHATSAPP: '525591396661',
      ...overrides,
    },
  };
}

/* ─── Aserciones ──────────────────────────────────────────────────── */

let pasadas = 0, fallidas = 0;
const fallos = [];

export function ok(cond, titulo, detalle = '') {
  if (cond) { pasadas++; console.log(`  ✓ ${titulo}`); }
  else { fallidas++; fallos.push(titulo + (detalle ? ` — ${detalle}` : '')); console.log(`  ✗ ${titulo}${detalle ? ' — ' + detalle : ''}`); }
}
export function igual(a, b, titulo) {
  ok(JSON.stringify(a) === JSON.stringify(b), titulo, `esperado ${JSON.stringify(b)}, recibido ${JSON.stringify(a)}`);
}
export function seccion(t) { console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 58 - t.length))}`); }
export function resumen() {
  console.log(`\n${'═'.repeat(64)}`);
  console.log(`${pasadas} comprobaciones pasadas · ${fallidas} fallidas`);
  if (fallos.length) { console.log('\nFallos:'); fallos.forEach((f) => console.log('  · ' + f)); }
  console.log('═'.repeat(64));
  return fallidas === 0;
}
