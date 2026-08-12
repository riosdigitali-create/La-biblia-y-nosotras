/**
 * Mantiene sincronizado el sistema visual entre los dos dominios.
 *
 *   node scripts/tokens.mjs check   → falla si se separaron
 *   node scripts/tokens.mjs sync    → copia la fuente de verdad
 *
 * La fuente de verdad es `sitio/assets/lbyn.css`, en el repositorio de
 * la landing. Aquí solo se copia el tramo comprendido entre :root y las
 * utilidades de collage, adaptando las rutas de fuentes e imágenes.
 *
 * Si la landing no está junto a este proyecto, el comando lo dice y no
 * hace nada: no inventa un archivo.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui   = dirname(fileURLToPath(import.meta.url));
const raiz   = join(aqui, '..');
const FUENTE = join(raiz, '..', 'sitio', 'assets', 'lbyn.css');
const DESTINO = join(raiz, 'public', 'assets', 'css', 'tokens.css');

const MARCA_INI = '/* ── INICIO DEL TRAMO SINCRONIZADO ────────────────────────── */';
const MARCA_FIN = '/* ── FIN DEL TRAMO SINCRONIZADO ───────────────────────────── */';

function tramoDeLaFuente() {
  const css = readFileSync(FUENTE, 'utf8');
  const ini = css.indexOf(':root{');
  /* El corte va tras los controles: la paleta, el collage, las piezas de
     texto y los botones son el sistema. Lo de después (entradas y
     movimiento reducido) cada dominio lo resuelve a su manera. */
  const fin = css.indexOf('/* ═══ Entradas');
  if (ini < 0 || fin < 0) throw new Error('no encuentro el tramo en lbyn.css');
  return css.slice(ini, fin).trimEnd()
    .replace("url('../isotipo-lbyn.png')", "url('../img/isotipo-lbyn.png')");
}

function tramoDelDestino() {
  const css = readFileSync(DESTINO, 'utf8');
  const a = css.indexOf(MARCA_INI);
  const b = css.indexOf(MARCA_FIN);
  if (a < 0 || b < 0) throw new Error('faltan las marcas de tramo en tokens.css');
  return css.slice(a + MARCA_INI.length, b).trim();
}

const orden = process.argv[2] ?? 'check';

if (!existsSync(FUENTE)) {
  console.log('⚠ No encuentro sitio/assets/lbyn.css junto a este proyecto.');
  console.log('  Si la landing vive en otro repositorio, la sincronización');
  console.log('  se hace a mano. No se ha tocado nada.');
  process.exit(0);
}

if (orden === 'sync') {
  const css = readFileSync(DESTINO, 'utf8');
  const a = css.indexOf(MARCA_INI) + MARCA_INI.length;
  const b = css.indexOf(MARCA_FIN);
  writeFileSync(DESTINO, css.slice(0, a) + '\n' + tramoDeLaFuente() + '\n\n' + css.slice(b));
  console.log('✓ tokens.css actualizado desde sitio/assets/lbyn.css');
  process.exit(0);
}

// check
const esperado = tramoDeLaFuente().trim();
const actual = tramoDelDestino();

if (esperado === actual) {
  console.log('✓ el sistema visual está sincronizado entre los dos dominios');
  process.exit(0);
}

const a = esperado.split('\n');
const b = actual.split('\n');
console.error('✗ tokens.css se separó de sitio/assets/lbyn.css\n');
for (let i = 0; i < Math.max(a.length, b.length); i++) {
  if (a[i] !== b[i]) {
    console.error(`  línea ${i + 1}`);
    console.error(`    landing:     ${a[i] ?? '(no existe)'}`);
    console.error(`    aplicación:  ${b[i] ?? '(no existe)'}`);
    break;
  }
}
console.error('\n  Arréglalo con:  npm run sync:tokens');
process.exit(1);
