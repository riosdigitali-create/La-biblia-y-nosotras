# Grupos de amistad — La Biblia y Nosotras

Aplicación sobre Cloudflare Pages Functions + D1, publicada en
`https://lbyn-grupos.pages.dev/`.

## Recorrido principal

```text
Una líder registra su grupo
  → el equipo recibe la solicitud en el panel
    → aceptar publica el grupo / rechazar conserva el motivo
      → los grupos aceptados aparecen en la búsqueda por código postal
        → una participante completa sus datos y solicita unirse
```

La publicación nunca ocurre desde el formulario público. Solo una persona con
sesión administrativa puede aceptar o rechazar. La aceptación inserta el grupo
y cambia la solicitud a `PUBLISHED` en una sola operación de D1.

## Enlaces

- Registro de grupos: `/registrar/`
- Búsqueda conversacional: `/acompanamiento/`
- Registro para unirse: `/asistir/`
- Panel del equipo: `/panel/`

## Implementación

```text
migrations/          esquema y transiciones de D1
src/lib/             autenticación, validación, cripto y reglas de negocio
src/lib/services/    servicios compartidos por formularios y chat
src/lib/chat/        conversación y búsqueda real por código postal
functions/api/       Pages Functions
public/              HTML, CSS y JavaScript sin framework
tests/               pruebas de extremo a extremo sobre SQLite
```

El panel actualiza solicitudes y métricas cada cinco segundos mientras la
pestaña está visible. La búsqueda consulta únicamente grupos `PUBLISHED` y no
usa datos de demostración. Si todavía no existe uno para el código postal,
ofrece el registro en lista de espera.

La conversación funciona sin proveedor de IA mediante un flujo guiado que
consulta D1. `CHAT_PROVIDER`, `CHAT_MODEL` y `CHAT_API_KEY` pueden configurarse
más adelante para habilitar conversación con modelo sin cambiar el flujo de
registro ni las reglas de negocio.

## Seguridad

- Turnstile protege los formularios públicos; el panel usa PIN secreto y
  bloqueo temporal después de varios intentos fallidos.
- Las sesiones administrativas usan cookies seguras y token CSRF.
- La autorización para solicitar unirse usa un token HMAC corto y separado del
  token de Turnstile.
- Las credenciales y pimientas están guardadas como secretos de Cloudflare.
- Toda aceptación y rechazo queda registrado en auditoría.

## Desarrollo

```bash
npm install
npm run db:migrate:local
npm run dev
```

Validación completa:

```bash
npm run typecheck
npm test
```

Despliegue:

```bash
npm run deploy
```

La base remota ya existía antes de incorporar la migración `0009`; por eso esa
migración se aplica de forma explícita con `wrangler d1 execute` y no repitiendo
toda la historia de migraciones.
