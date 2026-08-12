/* ═══════════════════════════════════════════════════════════════
   ABRE UN CÍRCULO DE AMIGAS

   Un solo envío, siete campos y ninguna etapa. El formulario largo de
   /registrar/ sigue existiendo para cuando haya que publicar círculos;
   éste sólo guarda quién eres, de qué iglesia vienes y dónde estás.

   La validación de verdad la hace el servidor. Lo de aquí es cortesía:
   avisar antes de mandar y no perder lo escrito.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var form   = document.getElementById('circulo');
  var msg    = document.getElementById('msg');
  var boton  = document.getElementById('enviar');
  var listo  = document.getElementById('listo');
  if (!form) return;

  var CLAVE = 'lbyn_circulo_borrador';

  /* ── No perder lo escrito ────────────────────────────────────── */

  function guardar() {
    try {
      var d = {};
      form.querySelectorAll('input[name]').forEach(function (c) {
        if (c.type === 'checkbox') return;          // los permisos se piden cada vez
        if (c.value) d[c.name] = c.value;
      });
      sessionStorage.setItem(CLAVE, JSON.stringify(d));
    } catch (e) { /* modo privado */ }
  }

  function restaurar() {
    try {
      var d = JSON.parse(sessionStorage.getItem(CLAVE) || 'null');
      if (!d) return;
      Object.keys(d).forEach(function (k) {
        var c = form.querySelector('[name="' + k + '"]');
        if (c && !c.value) c.value = d[k];
      });
    } catch (e) { /* nada */ }
  }

  function olvidar() {
    try { sessionStorage.removeItem(CLAVE); } catch (e) { /* nada */ }
  }

  /* ── Lo que llega escrito desde la landing ───────────────────────
     La portada de cuenta regresiva (`sitio/proximamente.html`) recoge
     los mismos campos y los manda en la URL, porque vive en otro
     dominio y la API sólo acepta su propio origen. Aquí se vuelcan en
     el formulario y se limpia la barra de direcciones: los datos no
     tienen por qué quedarse a la vista ni en el historial.

     Los permisos nunca viajan: se marcan aquí, cada vez. */
  function desdeURL() {
    try {
      if (!window.location.search) return;
      var q = new URLSearchParams(window.location.search);
      var tocado = false;

      form.querySelectorAll('input[name]').forEach(function (c) {
        if (c.type === 'checkbox') return;
        var v = q.get(c.name);
        if (!v || c.value) return;
        c.value = v.slice(0, c.maxLength > 0 ? c.maxLength : 200);
        tocado = true;
      });

      if (tocado) {
        guardar();
        if (window.history && history.replaceState) {
          history.replaceState(null, '', window.location.pathname + window.location.hash);
        }
      }
    } catch (e) { /* navegador antiguo: se escribe a mano y ya */ }
  }

  desdeURL();
  restaurar();
  form.addEventListener('input', guardar);

  /* ── Errores ─────────────────────────────────────────────────── */

  function limpiar() {
    form.querySelectorAll('[data-err]').forEach(function (p) { p.textContent = ''; });
    form.querySelectorAll('[aria-invalid]').forEach(function (c) {
      c.removeAttribute('aria-invalid');
    });
  }

  function pintar(errores) {
    var primero = null;
    Object.keys(errores || {}).forEach(function (campo) {
      var p = form.querySelector('[data-err="' + campo + '"]');
      if (p) p.textContent = errores[campo];
      var c = form.querySelector('[name="' + campo + '"]');
      if (c) {
        c.setAttribute('aria-invalid', 'true');
        if (!primero) primero = c;
      }
    });
    if (primero) {
      primero.focus();
      primero.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  /* ── Comprobación rápida antes de mandar ─────────────────────── */

  function revisar() {
    var e = {};
    var v = function (n) { var c = form.querySelector('[name="' + n + '"]'); return c ? c.value.trim() : ''; };

    if (v('full_name').split(/\s+/).filter(function (p) { return p.length >= 2; }).length < 2) {
      e.full_name = 'Escribe tu nombre y tu apellido.';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v('email'))) {
      e.email = 'Escribe un correo con este formato: tu@correo.com';
    }
    if (v('phone').replace(/\D/g, '').length < 10) {
      e.phone = 'Escribe tu WhatsApp a 10 dígitos.';
    }
    if (v('church_name').length < 2) e.church_name = 'Dinos cómo se llama tu iglesia.';
    if (v('city').length < 2) e.city = 'Dinos tu ciudad o tu zona.';

    if (!form.querySelector('[name="consent_privacy"]').checked) {
      e.consent_privacy = 'Necesitamos tu autorización para guardar tus datos.';
    }
    if (!form.querySelector('[name="consent_contact"]').checked) {
      e.consent_contact = 'Necesitamos tu permiso para poder escribirte.';
    }
    return e;
  }

  /* ── Envío ───────────────────────────────────────────────────── */

  form.addEventListener('submit', async function (ev) {
    ev.preventDefault();
    limpiar();
    msg.textContent = '';

    var e = revisar();
    if (Object.keys(e).length) { pintar(e); return; }

    boton.disabled = true;
    msg.textContent = 'Guardando…';

    var cuerpo = {};
    form.querySelectorAll('input[name]').forEach(function (c) {
      cuerpo[c.name] = c.type === 'checkbox' ? c.checked : c.value.trim();
    });
    var t = form.querySelector('[name="cf-turnstile-response"]');
    if (t) cuerpo.turnstile_token = t.value;

    try {
      var res = await fetch('/api/circles/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
      var data = null;
      try { data = await res.json(); } catch (x) { data = null; }

      if (!res.ok || !data || !data.ok) {
        if (data && data.errors) {
          pintar(data.errors);
          msg.textContent = 'Revisa los campos marcados.';
        } else {
          msg.textContent = (data && data.message) ||
            'No pudimos guardar tu registro. Vuelve a intentarlo en un momento.';
        }
        boton.disabled = false;
        return;
      }

      /* Listo: se cambia el formulario por la confirmación. */
      olvidar();
      var nombre = cuerpo.full_name.split(/\s+/)[0];
      document.getElementById('listo-nombre').textContent = nombre;
      document.getElementById('listo-folio').textContent = data.folio || '—';
      form.hidden = true;
      listo.hidden = false;
      listo.setAttribute('tabindex', '-1');
      listo.focus();
      listo.scrollIntoView({ block: 'center', behavior: 'smooth' });

    } catch (x) {
      msg.textContent = 'Se cayó la conexión. Revisa tu internet y vuelve a intentarlo.';
      boton.disabled = false;
    }
  });
})();
