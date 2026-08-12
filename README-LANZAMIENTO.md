# Portada de lanzamiento LBYN

La portada se publica en Cloudflare Pages desde `public/`.

El video de la portada proviene del archivo local
`sitio/Video Oficial La Biblia Y Nosotras.mp4`. La copia publicada conserva el
video completo, elimina únicamente el audio para permitir reproducción
automática y reduce el peso para web. El original no se modifica.

## Servicios conectados

- Registrar un grupo: `https://lbyn-grupos.pages.dev/registrar/`
- Unirse a un grupo: `https://lbyn-grupos.pages.dev/acompanamiento/`
- Panel del equipo: `https://lbyn-grupos.pages.dev/panel/`

Las solicitudes se revisan en el panel. Al aceptarlas, el grupo se publica en
D1 y aparece de inmediato en la búsqueda conversacional por código postal.

## Configuración de Cloudflare Pages

- Proyecto: `lbyn-lanzamiento`
- Rama: `cloudflare-launch-2026-08-15`
- Framework: ninguno
- Comando de compilación: vacío
- Directorio de salida: `public`

## Cambiar la fecha

En `public/index.html`, editar únicamente la constante `LAUNCH_DATE`. La fecha
actual es el 15 de agosto de 2026 a las 3:00 p.m. de Ciudad de México.
