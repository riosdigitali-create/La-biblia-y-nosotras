# Arquitectura

## Por qué está separado de la landing

La portada de lanzamiento vive en `public/` dentro del mismo repositorio y se
publica en Cloudflare Pages. No ejecuta código de servidor.

Grupos de amistad necesita base de datos, sesiones, estados y un panel. Son dos
ciclos de vida distintos: la landing es un artefacto de campaña con fecha; esto
es un producto permanente. Acoplarlos condenaría al segundo a heredar la deuda
del primero, y cualquier error en el monolito rompe el único canal de registro
de la Arena.

La integración ya está activa en el cierre de la portada: registrar un grupo,
unirse mediante la conversación y entrar al panel del equipo.

## Responsabilidades

| Servicio | Hace | No hace |
|---|---|---|
| **Pages** | Sirve HTML, CSS, JS y fuentes | Nada de lógica. Todo lo que sirve es no confiable |
| **Workers** | Validación, autorización, estados, búsqueda, sesiones, tokens | Trabajo pesado en la petición: se encola |
| **D1** | Fuente de verdad | Archivos. Solo guarda claves de objeto de R2 |
| **R2** | PDFs, exportaciones, evidencias | Base de datos |
| **Queues** | Correos, notificaciones, reintentos | Registro primario. Si falla, el dato ya está en D1 |
| **Cron** | Un disparador que despacha todo | Cinco disparadores: el plan Free solo permite cinco por cuenta |
| **Turnstile** | Los formularios públicos de registro | Sustituir la validación de servidor |

## Por qué no se usa Workflows

El prompt lo pedía. La decisión es no usarlo en la versión 1, y esta es la razón:

Un Workflow guarda su estado dentro del runtime. Una máquina de estados en D1
con transiciones validadas es **consultable, auditable, reconciliable y
reversible** con SQL. Para un proceso de aprobación con intervención humana,
donde lo importante es poder responder «¿en qué estado está esta solicitud y
quién la movió?», la tabla gana. Si más adelante aparece un proceso realmente
largo, se puede añadir sin rehacer nada.

## El orden de escritura, y por qué importa

```
POST /api/groups/apply
  1. Turnstile
  2. Validación de esquema
  3. Idempotencia (¿ya existe esta misma solicitud?)
  4. ESCRITURA EN D1  ← el éxito solo se declara aquí
  5. Respuesta con folio
  6. Encolar el correo   ← si esto falla, la solicitud ya está a salvo
```

La landing actual hace lo contrario: envía al webhook y, si falla, guarda en
`localStorage` del navegador de la usuaria. Aquí el respaldo es la base de
datos, no el dispositivo de quien se registra.

## Moderación y publicación

```text
PENDING_REVIEW
  ├─ rechazar → REJECTED, con motivo
  └─ aceptar  → PUBLISHED + fila visible en groups
```

La aceptación se realiza en un `DB.batch`: la creación del grupo y el cambio de
estado se confirman juntos. La búsqueda pública lee solamente grupos
`PUBLISHED`, visibles, activos y con cupo.

## Control de cupo

```sql
UPDATE groups SET occupied = occupied + 1
 WHERE id = ? AND editorial_status = 'PUBLISHED'
   AND is_active = 1 AND occupied < capacity;
```

Si `changes() = 0`, el grupo se llenó entre la búsqueda y el clic. La carrera
por el último lugar la resuelve la base de datos, no la aplicación. Si el
`INSERT` posterior falla, el lugar se devuelve.

## Qué se cifra, qué se hashea, qué se redacta

| Dato | Tratamiento |
|---|---|
| Contraseña administradora | PBKDF2-SHA256 con sal, solo el hash |
| Tokens de sesión y pastorales | SHA-256 con pimienta, solo el hash. Nunca en claro en la base |
| Correo y teléfono, para deduplicar | SHA-256 con pimienta (`email_hash`, `phone_hash`) |
| IP y user-agent en auditoría | SHA-256 con pimienta |
| Dirección, teléfono, correo reales | En claro, acceso restringido. **Nunca** en endpoints públicos ni en exportaciones |
| Auditoría y errores | Resúmenes redactados. `redact.ts` sustituye cualquier campo personal por `[redactado]` |
