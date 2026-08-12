/**
 * esbuild conserva los imports relativos tal cual están en el TypeScript
 * (`from '../crypto'`), y Node en modo ESM exige la extensión. Este paso
 * la añade sobre lo compilado. No toca el código fuente.
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

function recorrer(dir) {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) { recorrer(ruta); continue; }
    if (!nombre.endsWith('.js')) continue;
    const antes = readFileSync(ruta, 'utf8');
    const despues = antes
      .replace(/(from\s+["'])(\.{1,2}\/[^"']*?)(["'])/g,
        (m, a, ruta_, c) => (/\.(js|json|mjs)$/.test(ruta_) ? m : `${a}${ruta_}.js${c}`));
    if (antes !== despues) writeFileSync(ruta, despues);
  }
}

recorrer(dist);
console.log('extensiones .js añadidas a dist/');
