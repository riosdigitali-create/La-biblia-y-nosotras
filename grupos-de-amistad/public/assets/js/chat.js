/* ═══════════════════════════════════════════════════════════════
   Cliente de la conversación.

   Aquí no hay lógica conversacional: ni árbol, ni palabras clave, ni
   respuestas predefinidas. Este archivo solo pinta lo que dice el
   servidor y envía lo que escribe la persona.

   El token de sesión se guarda en sessionStorage para que la charla
   sobreviva si cierra la pestaña sin querer. El contenido vive en el
   servidor: aquí no se guarda nada personal.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var CLAVE_TOKEN = 'lbyn_chat_token';
  var CLAVE_HILO  = 'lbyn_chat_hilo';

  var hilo      = document.getElementById('hilo');
  var escrib    = document.getElementById('escribiendo');
  var barra     = document.getElementById('barra');
  var campo     = document.getElementById('texto');
  var enviarBtn = document.getElementById('enviar');
  var ayuda     = document.getElementById('ayuda');
  var waLink    = document.getElementById('waLink');

  var token = null;
  var whatsapp = '';
  var ocupado = false;
  var lento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Pintado ────────────────────────────────────────────────── */

  function abajo() { hilo.scrollTop = hilo.scrollHeight; }

  /** El texto del servidor se inserta como TEXTO, nunca como HTML. */
  function burbuja(texto, quien) {
    var d = document.createElement('div');
    d.className = 'burbuja burbuja--' + quien;
    String(texto).split(/\n{2,}/).forEach(function (parrafo) {
      var p = document.createElement('p');
      p.textContent = parrafo.replace(/\n/g, ' ');
      d.appendChild(p);
    });
    hilo.insertBefore(d, escrib);
    abajo();
    return d;
  }

  function aviso(texto) {
    var d = burbuja(texto, 'aviso');
    d.setAttribute('role', 'status');
    return d;
  }

  function escribiendo(on) {
    escrib.hidden = !on;
    escrib.setAttribute('aria-hidden', String(!on));
    if (on) abajo();
  }

  /* ── Persistencia del hilo (solo para no perderlo al cerrar) ─── */

  var comunidadesVistas = [];   // para poder repintar las tarjetas al volver
  var enlaceVisto = null;       // el paso final, si ya eligió grupo
  var registroVisto = null;     // enlace al formulario seguro de unión
  var nombreVisto = '';

  function guardarHilo() {
    try {
      var msgs = [];
      hilo.querySelectorAll('.burbuja').forEach(function (b) {
        var quien = b.classList.contains('burbuja--yo') ? 'yo'
                  : b.classList.contains('burbuja--aviso') ? 'aviso' : 'ella';
        msgs.push({ q: quien, t: b.textContent.trim() });
      });
      sessionStorage.setItem(CLAVE_HILO, JSON.stringify({
        msgs: msgs.slice(-40),
        comunidades: comunidadesVistas,
        enlace: enlaceVisto,
        registro: registroVisto,
        nombre: nombreVisto,
        whatsapp: whatsapp   // número del equipo; no es un dato privado
      }));
    } catch (e) { /* modo privado: se sigue sin persistir */ }
  }

  function restaurarHilo() {
    try {
      var guardado = JSON.parse(sessionStorage.getItem(CLAVE_HILO) || 'null');
      if (!guardado || !guardado.msgs || !guardado.msgs.length) return false;
      guardado.msgs.forEach(function (m) { burbuja(m.t, m.q); });
      comunidadesVistas = guardado.comunidades || [];
      enlaceVisto = guardado.enlace || null;
      registroVisto = guardado.registro || null;
      nombreVisto = guardado.nombre || '';
      // Sin esto, al volver a la pestaña la tarjeta se quedaría sin botón.
      whatsapp = guardado.whatsapp || whatsapp;
      comunidadesVistas.forEach(function (g) { tarjetaComunidad(g, nombreVisto); });
      if (enlaceVisto) tarjetaEnlace(enlaceVisto);
      if (registroVisto) tarjetaRegistro(registroVisto);
      return true;
    } catch (e) { return false; }
  }

  function olvidar() {
    try { sessionStorage.removeItem(CLAVE_TOKEN); sessionStorage.removeItem(CLAVE_HILO); }
    catch (e) { /* nada */ }
  }

  /* ── Tarjeta de comunidad ───────────────────────────────────────
     La pinta el cliente con lo que devolvió el servidor. Ningún dato
     se inventa aquí: si un campo no viene, esa línea no aparece. */

  var DIAS = { lunes:'Lunes', martes:'Martes', miercoles:'Miércoles', jueves:'Jueves',
               viernes:'Viernes', sabado:'Sábado', domingo:'Domingo' };
  var MODALIDAD = { presencial:'Presencial', linea:'En línea' };

  function linea(caja, etiqueta, valor) {
    if (!valor) return;
    var p = document.createElement('p');
    p.className = 'ficha__dato';
    var b = document.createElement('span');
    b.className = 'ficha__etiqueta-dato';
    b.textContent = etiqueta;
    p.appendChild(b);
    p.appendChild(document.createTextNode(valor));
    caja.appendChild(p);
  }

  function tarjetaComunidad(g, nombre) {
    var art = document.createElement('article');
    art.className = 'ficha';

    var eti = document.createElement('p');
    eti.className = 'ficha__etiqueta';
    eti.textContent = 'Tu comunidad';
    art.appendChild(eti);

    var t = document.createElement('h2');
    t.className = 'ficha__nombre';
    t.textContent = g.nombre || 'Grupo de amistad';
    art.appendChild(t);

    var datos = document.createElement('div');
    datos.className = 'ficha__datos';
    // `guia` solo llega si la líder autorizó que se muestre su nombre.
    linea(datos, 'Guía', g.lider);
    linea(datos, 'Dónde', [g.zona, g.municipio, g.estado].filter(Boolean).join(' · '));
    linea(datos, 'Cuándo', [DIAS[g.dia] || g.dia, g.horario].filter(Boolean).join(', '));
    linea(datos, 'Cómo', MODALIDAD[g.modalidad] || g.modalidad);
    linea(datos, 'Lugares', g.cupo_texto);
    art.appendChild(datos);

    /* Elegir el grupo. También se puede escribiendo: el botón es un
       atajo, no la única puerta. */
    if (g.numero) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ficha__elegir';
      b.textContent = 'Elegir este grupo';
      b.addEventListener('click', function () {
        /* Se envía como si lo hubiera escrito: el servidor decide. */
        hilo.querySelectorAll('.ficha__elegir').forEach(function (x) { x.disabled = true; });
        enviar('Quiero el grupo ' + g.numero + ', ' + (g.nombre || ''));
      });
      art.appendChild(b);
    }

    hilo.insertBefore(art, escrib);
    abajo();
  }

  /* ── El paso final: la despedida y el contacto ────────────────
     Se pinta cuando el servidor confirma que el lugar quedó apartado. */
  function tarjetaEnlace(e) {
    var art = document.createElement('article');
    art.className = 'enlace';

    var t = document.createElement('p');
    t.className = 'enlace__titulo';
    t.textContent = '¡Listo' + (e.nombre ? ', ' + e.nombre : '') + '!';
    art.appendChild(t);

    var p = document.createElement('p');
    p.className = 'enlace__texto';
    p.textContent = 'Nos alegra mucho acompañarte en este camino. ' +
                    'Te llevamos con tu grupo para que puedan estar en contacto.';
    art.appendChild(p);

    if (whatsapp) {
      var partes = ['Hola, soy ' + (e.nombre || '') + '.',
                    'Acabo de apartar mi lugar en las seis semanas'];
      if (e.grupo) partes.push('con el grupo ' + e.grupo);
      if (e.dia || e.horario) partes.push('(' + [DIAS[e.dia] || e.dia, e.horario].filter(Boolean).join(' ') + ')');
      partes.push('y me gustaría ponerme en contacto con su líder.');

      var a = document.createElement('a');
      a.className = 'enlace__wa';
      a.href = 'https://wa.me/' + whatsapp + '?text=' + encodeURIComponent(partes.join(' '));
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'Hablar por WhatsApp';
      art.appendChild(a);
    }

    hilo.insertBefore(art, escrib);
    abajo();
  }

  /* Buscar es anónimo. Para apartar el lugar sí hacen falta datos y
     consentimiento; esta tarjeta lleva al formulario con el grupo y el CP
     ya elegidos. */
  function tarjetaRegistro(registro) {
    var art = document.createElement('article');
    art.className = 'enlace';

    var t = document.createElement('p');
    t.className = 'enlace__titulo';
    t.textContent = registro.grupo ? 'Unirme a ' + registro.grupo : 'Continuar mi registro';
    art.appendChild(t);

    var p = document.createElement('p');
    p.className = 'enlace__texto';
    p.textContent = registro.grupo
      ? 'Completa tus datos y enviaremos tu solicitud de unión a este grupo.'
      : 'Déjanos tus datos y te avisaremos cuando se publique un grupo cerca de ti.';
    art.appendChild(p);

    var a = document.createElement('a');
    a.className = 'enlace__wa';
    var q = new URLSearchParams();
    if (registro.grupo_id) q.set('grupo', registro.grupo_id);
    if (registro.codigo_postal) q.set('cp', registro.codigo_postal);
    if (!registro.grupo_id) q.set('espera', '1');
    a.href = '/asistir/?' + q.toString();
    a.textContent = registro.grupo_id ? 'Completar registro y unirme' : 'Dejar mis datos';
    art.appendChild(a);

    hilo.insertBefore(art, escrib);
    abajo();
  }

  /* ── Derivación a una persona ───────────────────────────────── */

  function mostrarAyuda(resumen) {
    if (!whatsapp) return;
    var msg = resumen || 'Hola, vengo del acompañamiento de La Biblia y Nosotras y me gustaría platicar con alguien del equipo.';
    waLink.href = 'https://wa.me/' + whatsapp + '?text=' + encodeURIComponent(msg);
    ayuda.hidden = false;
  }

  /* ── Red ────────────────────────────────────────────────────── */

  async function pedir(ruta, cuerpo) {
    var res, data = null;
    try {
      res = await fetch(ruta, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo || {})
      });
    } catch (e) { throw e; }

    try { data = await res.json(); } catch (e2) { data = null; }

    return { res: res, data: data };
  }

  async function abrirSesion() {
    var r = await pedir('/api/chat/session', {});
    if (!r.res.ok || !r.data || !r.data.ok) {
      throw new Error((r.data && r.data.code) || 'sin_sesion');
    }
    token = r.data.token;
    whatsapp = r.data.whatsapp || '';
    try { sessionStorage.setItem(CLAVE_TOKEN, token); } catch (e) { /* nada */ }
    return r.data.saludo;
  }

  async function enviar(texto) {
    if (ocupado) return;
    var limpio = String(texto || '').trim();
    if (!limpio) return;

    ocupado = true;
    enviarBtn.disabled = true;
    burbuja(limpio, 'yo');
    campo.value = '';
    campo.style.height = 'auto';
    guardarHilo();

    if (!lento) escribiendo(true);

    try {
      var r = await pedir('/api/chat/message', { token: token, texto: limpio });
      escribiendo(false);

      if (r.res.status === 440 || (r.data && r.data.code === 'session_expired')) {
        olvidar();
        aviso('La conversación caducó por inactividad. Vamos a empezar de nuevo.');
        await iniciar(true);
        return;
      }

      if (r.res.status === 429) {
        aviso('Vas muy rápido. Espera unos segundos y vuelve a escribir.');
        return;
      }

      if (!r.res.ok || !r.data || !r.data.ok) {
        aviso((r.data && r.data.message) ||
          'Algo falló de nuestro lado. Si sigue sin funcionar, escríbenos por WhatsApp.');
        mostrarAyuda();
        return;
      }

      burbuja(r.data.respuesta, 'ella');

      // Si el servidor encontró comunidades, se pintan bajo el mensaje.
      var datos = r.data.datos;
      if (datos && datos.comunidades && datos.comunidades.length) {
        comunidadesVistas = datos.comunidades;
        nombreVisto = datos.nombre || nombreVisto;
        comunidadesVistas.forEach(function (g) { tarjetaComunidad(g, nombreVisto); });
      }
      if (datos && datos.enlace) {
        comunidadesVistas = [];          /* ya eligió: las tarjetas sobran */
        enlaceVisto = datos.enlace;
        tarjetaEnlace(enlaceVisto);
      }
      if (datos && datos.registro) {
        registroVisto = datos.registro;
        tarjetaRegistro(registroVisto);
      }
      if (datos && datos.registro_espera) {
        registroVisto = datos.registro_espera;
        tarjetaRegistro(registroVisto);
      }

      if (r.data.escalado || r.data.agotada) mostrarAyuda();
      if (r.data.agotada) {
        campo.disabled = true;
        campo.placeholder = 'Sigamos por WhatsApp';
      }
      guardarHilo();

    } catch (e) {
      escribiendo(false);
      aviso('Se cayó la conexión. Revisa tu internet y vuelve a intentarlo.');
      mostrarAyuda();
    } finally {
      ocupado = false;
      enviarBtn.disabled = false;
      // No se fuerza el foco en móvil: abrir el teclado sin pedirlo estorba.
      if (window.matchMedia('(min-width:900px)').matches) campo.focus();
    }
  }

  /* ── Arranque ───────────────────────────────────────────────── */

  async function iniciar(reinicio) {
    var previo = null;
    try { previo = sessionStorage.getItem(CLAVE_TOKEN); } catch (e) { previo = null; }

    if (previo && !reinicio) {
      token = previo;
      var habia = restaurarHilo();
      // El token se valida en el primer mensaje. Si caducó, se reinicia solo.
      if (habia) { abajo(); return; }
    }

    try {
      var saludo = await abrirSesion();
      if (!lento) {
        escribiendo(true);
        await new Promise(function (r) { setTimeout(r, 480); });
        escribiendo(false);
      }
      burbuja(saludo, 'ella');
      guardarHilo();
    } catch (e) {
      aviso('No pudimos abrir la conversación en este momento. ' +
            'Escríbenos por WhatsApp y una persona del equipo te atiende.');
      mostrarAyuda();
    }
  }

  /* ── Eventos ────────────────────────────────────────────────── */

  barra.addEventListener('submit', function (e) {
    e.preventDefault();
    enviar(campo.value);
  });

  campo.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(campo.value); }
  });

  campo.addEventListener('input', function () {
    campo.style.height = 'auto';
    campo.style.height = Math.min(campo.scrollHeight, 132) + 'px';
  });

  /* Con el teclado abierto, el navegador encoge la ventana visible.
     Se sigue esa medida para que la barra de escritura no quede debajo. */
  if (window.visualViewport) {
    var ajustar = function () {
      document.documentElement.style.setProperty(
        '--alto-visible', window.visualViewport.height + 'px');
      abajo();
    };
    window.visualViewport.addEventListener('resize', ajustar);
    ajustar();
  }

  iniciar(false);
})();
