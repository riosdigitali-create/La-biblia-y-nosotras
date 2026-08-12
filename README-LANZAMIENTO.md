# Portada de lanzamiento LBYN

La versión de Cloudflare se publica desde `public/`. El sitio histórico de la
raíz del repositorio queda intacto.

La portada usa como fuente el archivo local
`sitio/Video Oficial La Biblia Y Nosotras.mp4`. La copia publicada conserva el
video completo, elimina únicamente el audio para la reproducción automática y
reduce el peso para web. El original no se modifica.

## Configuración de Cloudflare Pages

- Rama: `cloudflare-launch-2026-08-15`
- Framework: ninguno
- Comando de compilación: vacío
- Directorio de salida: `public`

## Cambiar la fecha

En `public/index.html`, editar únicamente la constante `LAUNCH_DATE`. La fecha
actual es el 15 de agosto de 2026 a las 3:00 p.m. de Ciudad de México.

## Destino de los botones

Mientras la aplicación de círculos termina de publicarse, los dos llamados a
la acción abren el WhatsApp oficial de LBYN con un mensaje preparado. Cuando
`lbyn-grupos.pages.dev` esté activo, sustituir esos dos enlaces por la ruta
`/circulo/` de la aplicación.
