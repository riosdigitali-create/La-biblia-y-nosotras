# sitio/ — lo que se publica en labibliaynosotras.com

Espejo de `riosdigitali-create/La-biblia-y-nosotras` rama `main` (GitHub Pages).
Cada push a `main` sale a producción sin previsualización.

## Qué es esta página

Cuatro momentos, y nada más:

```
1 · PORTADA   titular, frase, acción y video · «La Arena no fue el final»
2 · UMBRAL    franja roja · «De un estadio lleno a una mesa con tu nombre»
3 · CAMINOS   «Lo que Dios comenzó, continúa» · el círculo + una franja secundaria
4 · CIERRE    el pie como contraportada
```

Está compuesta como una revista, no como un collage digital: la portada es
una retícula asimétrica —la voz a la izquierda, el video a la derecha— y el
video es la imagen auténtica, sin nadie recortado encima y sin marco de
papel. Alterna momentos expresivos (la franja roja plena) con momentos
tranquilos (los caminos, sobre crema).

La identidad la construyen tipografía, fotografía y espacio. Hay **un solo
gesto táctil en toda la página**: el tachado rojo sobre «no fue el final»,
que además significa algo. No hay grano, ni papel rasgado, ni sellos, ni
marcas de agua, ni rotaciones, ni sombras de elevación.

No hay contadores, ni cronologías, ni CTA flotante que tape nada.

### La primera pantalla

La portada entera cabe en una pantalla de 1366×768 sin recortar nada. Dos
reglas la sostienen:

- **El titular tiene techo.** El cuerpo del titular es
  `clamp(2.3rem, 4.2vw, 4rem)`, y el techo lo pone «no fue el final.»: esa
  línea va en `white-space:nowrap` y tiene que caber entera —punto incluido—
  en la columna de la voz. Más grande, el punto se queda huérfano en un
  tercer renglón.
- **`min-height` con techo.** La portada se estira a `min(100svh, 860px)`, y
  sólo a partir de 1000×640. Por encima de eso la pantalla completa no
  compone: sólo fabrica vacío.

## El camino principal: círculos de amigas

La prioridad ya no es que alguien busque un círculo cerca y se una. Es
que **cada mujer abra el suyo**. Se llaman **círculos de amigas**, y ese
nombre se usa en todas partes: no hay «grupos», ni «mesas», ni
«comunidades» compitiendo por decir lo mismo.

| Camino | Destino | Peso |
|---|---|---|
| **Quiero abrir mi círculo** | `/circulo/` | El principal. Aparece dos veces: en la portada y en la tarjeta del círculo |
| ¿Todavía no quieres abrir uno? | `/acompanamiento/` | Segundo. Una franja compacta, no otra tarjeta |
| Encontrar un círculo cerca | — | **No existe todavía.** Se anuncia sin prometer fecha |

La acción principal está ya en la primera pantalla. El acompañamiento vive
ahí también, pero como enlace de texto («o platica primero con nosotras»):
existe, y no compite.

El formulario de `/circulo/` pide siete campos, dos de ellos opcionales:

```
nombre · correo · WhatsApp · iglesia · ciudad
nombre del círculo (opcional) · cuántas serían (opcional)
```

No pide dirección, ni cupo, ni día, ni horario. Eso lo decide cada quien
con sus amigas; el sitio sólo necesita saber quién es, de dónde viene y
cómo escribirle.

**`/registrar/` sigue existiendo** —21 campos, doble aprobación, todo el
proceso para publicar un círculo y que otras lo encuentren— pero hoy no
se enlaza desde ninguna parte. Está aparcado, no borrado, para cuando la
búsqueda cercana entre en juego.

## Cómo cambiar a dónde llevan

Un solo sitio, en `index.html`, buscando `LBYN_RUTAS`:

```js
window.LBYN_RUTAS = {
  ORIGEN : 'https://lbyn-grupos.pages.dev',   // ← el único valor a cambiar
  RUTAS  : {
    circulo        : '/circulo/',
    acompanamiento : '/acompanamiento/',
    asistir        : '/asistir/',
    registrar      : '/registrar/',
    privacidad     : '/privacidad/'
  }
};
```

- **`ORIGEN` vacío** → rutas relativas. Es lo que sirve en desarrollo, cuando
  todo corre bajo el mismo host.
- **`ORIGEN` con URL** → se antepone a cada ruta. Es lo que hace falta en
  producción, porque landing y aplicación viven en dominios distintos.

Debe coincidir con `APP_ORIGIN` en el `wrangler.toml` de la aplicación. Se
cambia aquí y allá, en ningún otro sitio.

Los `href` del HTML ya llevan la ruta relativa: la página funciona aunque el
JavaScript no cargue.

### Ver el chat sin desplegar nada

Al abrir `index.html` con doble clic (protocolo `file://`) no hay servidor ni
dominio, así que los enlaces apuntan a la carpeta de al lado:
`../grupos-de-amistad/public/acompanamiento/index.html`. **La pantalla del chat
se abre, se ve con todos sus estilos y conversa**: sin servidor entra la vista
previa (`assets/js/chat-vista-previa.js`), un guion local que sigue el mismo
camino y la misma voz. Lo dice en el primer mensaje y no guarda nada.

En cuanto el servidor responde —con `npm run dev` o ya desplegado con el modelo
configurado— la vista previa no se enciende: manda siempre el modelo.

Para que eso funcione, las páginas de la aplicación cargan sus hojas, imágenes
y guiones con rutas **relativas** (`../assets/…`), no absolutas. Y llevan un
guion corto que traduce los enlaces internos (`/asistir/` → la carpeta vecina)
únicamente cuando el protocolo es `file:`. Con servidor no cambia nada.

Para que además conteste:

```bash
cd grupos-de-amistad
npm run db:migrate:local   # crea la base local
npm run seed               # tres grupos de prueba: CP 04100, 57000, 06000
npm run dev                # http://localhost:8788
```

Con `npm run dev` los enlaces pasan a ser relativos solos: la aplicación sirve
todo bajo el mismo host.

## Sistema visual

```
assets/lbyn.css     paleta, collage, controles, base   ← fuente de verdad
assets/landing.css  la composición de esta página
assets/img/         derivados de 04.webp
```

`lbyn.css` es la fuente de verdad de la marca. Su bloque `:root` y las
utilidades de collage se copian a `grupos-de-amistad/public/assets/css/tokens.css`.
Son dos dominios y no pueden compartir el archivo, así que hay un guardián:

```bash
cd grupos-de-amistad
npm run check:tokens   # avisa si los dos se separaron
npm run sync:tokens    # copia la fuente de verdad
```

`npm test` corre `check:tokens` antes que nada: si alguien edita un color solo
en un lado, las pruebas fallan.

### El lenguaje del collage

`04.webp` tradujo su vocabulario a CSS: `.grano`, `.tela`, `.rasgado-*`,
`.sello`, `.subrayado`, `.circulado`, `.nota-margen`, `.fragmento`.

**La landing ya no usa ninguna de esas clases.** Acumuladas —papel rasgado,
grano, sellos, marcas de agua, rotaciones, recortes de personas pegados como
calcomanías— la página se sentía producida y artificial, sobre todo en móvil,
donde todo eso queda apilado. Siguen definidas en `lbyn.css` porque forman
parte del tramo que comparte la aplicación, pero aquí no se invocan.

Si algún día vuelve un gesto táctil, que vuelva **uno**, y con una razón.

### Jerarquía cromática

| Color | Oficio |
|---|---|
| Crema `#F4F3EA` | El papel sobre el que se compone |
| Negro `#151714` | La voz que se lee |
| Rojo `#FF0C00` | Superficies grandes y trazos |
| **Rojo tinta `#C00A02`** | Texto pequeño y fondos de botón — el mismo rojo, legible |
| Rosa `#FF88B0` | Acento puntual: la selección, el hover del pie. Nunca una superficie grande |
| Verde oscuro `#1F5144` | El camino de comunidad, y solo eso |
| Amarillo, azules, naranja | Acentos escasos y deliberados |

El rojo de marca sobre crema da 3.55:1 y no pasa AA. Por eso el texto pequeño y
los botones usan `--red-tinta`, que da 5.74:1. La marca no cambia: se lee.

## El video de portada

En la carpeta hay dos videos, y cada uno tiene su oficio:

| Original | Qué es |
|---|---|
| `Video Oficial La Biblia Y Nosotras.mp4` | 3840×1634, 72 s, 688 MB. El tráiler con las voces del evento. **De aquí sale la portada.** |
| `video.webp` | Un MP4 disfrazado: 852×480, 48 s, 24.5 MB. El material íntimo — la niña, el desierto, el logotipo en la arena. |

Los dos se conservan intactos. Ninguna página los carga.

### Lo que se publica

| Pieza | Qué es | Peso |
|---|---|---|
| `assets/video/poster-oficial.webp` | Fotograma del segundo 10.4 del oficial | 32 KB |
| `assets/video/portada.mp4` · `.webm` | El clip de portada: 15 s, **sin audio, en bucle** | 0.8 MB |

El clip son tres tramos del oficial, encadenados con fundidos:

```
7.4–13.0s    la mujer hablando al aire libre, cielo azul
23.5–28.0s   la Arena
63.5–69.0s   el isotipo, animado
```

### Cómo se comporta

Arranca **solo, en silencio y en bucle**. Sin botones, sin controles, sin
ventanas emergentes. Solo la imagen.

```
Siempre       el póster (32 KB). Nunca hay hueco ni salto.
Al acercarse  el clip (0.8 MB), y solo si el contexto lo permite.
```

No arranca si hay `prefers-reduced-motion`, `Save-Data` o conexión 2G: en esos
casos manda el póster, que es un fotograma del mismo video. Se pausa al salir
de pantalla y al ocultarse la pestaña.

Primera pantalla completa: **144 KB**. Con el video, 955 KB.

### Piezas guardadas, por si se quieren

`lbyn-oficial.mp4` (8.1 MB, el oficial completo con audio),
`lbyn-mensaje.mp4` (5.8 MB) y `lbyn-hero.mp4/.webm` (el clip íntimo).
Ninguna se carga hoy. Si algún día quieres una pantalla para verlas con
sonido, ya están listas.

## Los recursos gráficos

| Archivo | Qué es de verdad | Uso |
|---|---|---|
| `04.webp` | El collage: 1920×1080, papel rasgado, corazones bordados | Origen de todos los derivados |
| `assets/img/corazon.webp` | El corazón bordado | **Sin uso** en la landing. Sello del chat |
| `assets/img/collage-vertical.webp` | Recorte en retrato | **Sin uso.** La franja roja es rojo pleno |
| `assets/img/papel.webp` | El borde rasgado | **Sin uso** |
| `assets/img/collage-ancho-sm.webp` | Panorámica ligera | **Sin uso** |
| `logo.webp` | Logotipo completo, **blanco sobre transparente** | Pie, en claro |
| `isotipo-lbyn.png` | La «n», negra sobre transparente | Sólo la marca de la cabecera |
| `LaBibliayNosotras-03.webp` | La «n» en **rosa**, cuadrada | **Sin uso.** Era la marca de agua de la portada |

### Los retratos de la pastora

En la carpeta hay diez PNG sin fondo (`*_recorte.png`). **Ninguno se carga
tal cual**: pesan entre 300 KB y 1.4 MB y traen márgenes transparentes
enormes. De ellos salen tres derivados recortados al contenido y en WebP:

| Derivado | Origen | Dónde aparece | Peso |
|---|---|---|---|
| `assets/img/retratos/circulo-biblia.webp` | `7IV09313_recorte.png` | **El único en uso.** «Abre un círculo»: apoyada dentro de una lámina negra limpia, sin borde rasgado ni sombra | 60 KB |
| `assets/img/retratos/portada-pastora.webp` | `7IV08903_recorte.png` | Sin uso. Encima del video se leía como calcomanía, y además repetía a la misma persona que ya sale dentro del video | 115 KB |
| `assets/img/retratos/abrazo-biblia.webp` | `7IV06179_recorte.png` | Sin uso. El acompañamiento es ahora una pausa tipográfica, no otra tarjeta con retrato | 35 KB |

Los diez originales quedan intactos: los derivados se regeneran recortando
al *bounding box* del canal alfa y exportando a WebP con calidad 84.

`DSC09656_recorte.png` —la que se esconde detrás de la Biblia— se descartó
para la sección del círculo: la cara queda tapada y la pierna levantada lee
como un accidente. `7IV09313` dice lo mismo (Biblia abierta, cerca, sentada)
con una expresión que sí se ve.

Se usa **uno**, no diez ni tres. La misma persona repetida por toda la página
la convierte en un catálogo, y un recorte sin fondo puesto encima de otra
imagen siempre se lee como una calcomanía.

### Un error corregido

`LaBibliayNosotras-03.webp` se usaba como **póster del video** y como logotipo
del nav. No es ninguna de las dos cosas: es el isotipo rosa sobre transparente.
El póster es un fotograma del propio video, y este archivo dejó de cargarse:
como marca de agua gigante sólo añadía ruido a la portada.

## Los archivos

| Archivo | Uso |
|---|---|
| `index.html` | La landing |
| `assets/lbyn.css` | Sistema visual de la marca |
| `assets/landing.css` | Composición de la landing |
| `chatbot.html` | Redirección a `/acompanamiento/`. Sin lógica propia |
| `assets/img/retratos/` | Los derivados de los PNG originales. Hoy la landing carga uno |
| `assets/video/` | Póster, clip ambiental y mensaje completo |
| `video.webp` | Original íntegro. Ya no lo carga ninguna página |
| `logo.webp` | Logotipo del pie |
| `LaBibliayNosotras-03.webp` | Sin referencias desde el rediseño |

| `AloeveraDisplay-Medium (1).otf` | Tipografía funcional |
| `LibreBaskerville-Bold (1).ttf` | Tipografía editorial |
| `isotipo-lbyn.png` | Sello: cabecera, franja roja, pie |
| `CNAME` | `labibliaynosotras.com` |
| `logo.png`, `LaBibliayNosotras-03.jpg` | Sin referencias |

## Sigue pendiente, y no se resuelve con código

**Rotar los dos webhooks de Make.** Esta página ya no los usa, pero siguen en
el historial del repositorio público. Borrarlos del código no los invalida.
