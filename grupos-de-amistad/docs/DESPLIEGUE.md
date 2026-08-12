# Despliegue y operación

## Producción

- Proyecto Pages: `lbyn-grupos`
- URL: `https://lbyn-grupos.pages.dev`
- D1: `lbyn-grupos`
- Configuración: `wrangler.jsonc`
- Widget Turnstile: `LBYN Grupos`

El proyecto se despliega desde esta carpeta:

```bash
npm install
npm run typecheck
npm test
npm run deploy
```

## Secretos requeridos

Los valores viven cifrados en Cloudflare Pages y no se guardan en Git:

```bash
npx wrangler pages secret put SESSION_PEPPER --project-name=lbyn-grupos
npx wrangler pages secret put HASH_PEPPER --project-name=lbyn-grupos
npx wrangler pages secret put TURNSTILE_SECRET_KEY --project-name=lbyn-grupos
npx wrangler pages secret put PANEL_PIN --project-name=lbyn-grupos
```

Si se activa un proveedor de conversación también se añade `CHAT_API_KEY`.

## Migraciones

Para una base nueva:

```bash
npm run db:migrate:local
npm run db:migrate:remote
```

La base de producción actual se inicializó antes de versionar el historial de
Wrangler. Por eso la migración de moderación directa se aplicó explícitamente:

```bash
npx wrangler d1 execute lbyn-grupos --remote \
  --file migrations/0009_moderacion_directa.sql
```

No ejecutar toda la cadena de migraciones otra vez sobre esa base.

## Operación del panel

1. Abrir `/panel/` e ingresar el PIN compartido por el equipo.
2. Revisar los datos privados de la solicitud.
3. `Aceptar y publicar grupo` lo deja disponible en la búsqueda por CP.
4. `Rechazar` exige un motivo y conserva la trazabilidad.

El PIN se puede rotar repitiendo `pages secret put PANEL_PIN` y desplegando de
nuevo. Para auditoría por persona, configurar Cloudflare Access en vez de un
PIN compartido.

## Copia de seguridad y rollback

Antes de una migración futura:

```bash
npx wrangler d1 export lbyn-grupos --remote --output=lbyn-grupos-backup.sql
```

Pages conserva despliegues anteriores; se puede promover uno desde el panel de
Cloudflare o volver a desplegarlo. Las migraciones de D1 requieren una estrategia
de reversión propia.
