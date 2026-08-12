/* ═══════════════════════════════════════════════════════════════
   Registro de líder — control de etapas.

   Principios que este archivo respeta:
   · El cambio de paso conserva el contexto, se anuncia a tecnologías
     de asistencia y devuelve el foco al título de la etapa.
   · Los errores viven junto al campo y explican cómo corregir.
   · El botón pegado abajo no tapa el campo activo con el teclado abierto.
   · La validación de aquí es cortesía. La que manda es la del servidor.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var ESTADOS = ['Aguascalientes','Baja California','Baja California Sur','Campeche','Chiapas',
    'Chihuahua','Ciudad de México','Coahuila','Colima','Durango','Estado de México','Guanajuato',
    'Guerrero','Hidalgo','Jalisco','Michoacán','Morelos','Nayarit','Nuevo León','Oaxaca','Puebla',
    'Querétaro','Quintana Roo','San Luis Potosí','Sinaloa','Sonora','Tabasco','Tamaulipas',
    'Tlaxcala','Veracruz','Yucatán','Zacatecas'];

  var DIAS = { lunes:'Lunes', martes:'Martes', miercoles:'Miércoles', jueves:'Jueves',
    viernes:'Viernes', sabado:'Sábado', domingo:'Domingo' };

  var form     = document.getElementById('form');
  var stages   = Array.prototype.slice.call(document.querySelectorAll('.stage'));
  var bar      = document.getElementById('bar');
  var backBtn  = document.getElementById('back');
  var nextBtn  = document.getElementById('next');
  var submitBtn= document.getElementById('submit');
  var success  = document.getElementById('success');
  var formErr  = document.getElementById('e_form');
  var current  = 0;

  // Región para anunciar el cambio de etapa
  var live = document.createElement('p');
  live.className = 'sr-only';
  live.setAttribute('aria-live', 'polite');
  document.body.appendChild(live);

  // ── Catálogo de estados ─────────────────────────────────
  var estadoSel = document.getElementById('estado');
  estadoSel.appendChild(new Option('Elige tu estado', ''));
  ESTADOS.forEach(function (e) { estadoSel.appendChild(new Option(e, e)); });

  // ── Campos condicionales ────────────────────────────────
  var modality = document.getElementById('modality');
  var privateBlock = document.getElementById('private_block');
  modality.addEventListener('change', function () {
    var presencial = modality.value === 'presencial';
    privateBlock.hidden = !presencial;
    document.getElementById('address_private').required = presencial;
  });

  var churchType = document.getElementById('church_type');
  var churchFields = document.getElementById('church_fields');
  var sinIglesiaNote = document.getElementById('sin_iglesia_note');
  var consentPastoralRow = document.getElementById('consent_pastoral').closest('.consent');

  churchType.addEventListener('change', function () {
    var sin = churchType.value === 'sin_iglesia';
    churchFields.hidden = sin;
    sinIglesiaNote.hidden = !sin;
    consentPastoralRow.hidden = sin;
    ['church_name','pastors_name','pastoral_contact'].forEach(function (id) {
      document.getElementById(id).required = !sin;
    });
  });

  // ── Validación por etapa ────────────────────────────────
  function clearErrors(stage) {
    stage.querySelectorAll('.field--error').forEach(function (f) { f.classList.remove('field--error'); });
    stage.querySelectorAll('.field__error').forEach(function (e) { e.textContent = ''; });
  }

  function setError(name, message) {
    var el = document.getElementById(name);
    var box = document.getElementById('e_' + name);
    if (box) box.textContent = message;
    if (el && el.closest('.field')) el.closest('.field').classList.add('field--error');
  }

  function validateStage(index) {
    var stage = stages[index];
    clearErrors(stage);
    var firstBad = null;

    stage.querySelectorAll('input, select, textarea').forEach(function (el) {
      if (el.hidden || el.closest('[hidden]')) return;
      var v = (el.value || '').trim();

      if (el.type === 'checkbox') {
        if (el.required && !el.checked) {
          setError(el.id, 'Necesitamos tu aceptación para continuar.');
          firstBad = firstBad || el;
        }
        return;
      }
      if (el.required && !v) {
        setError(el.id, 'Este dato es necesario para continuar.');
        firstBad = firstBad || el;
        return;
      }
      if (!v) return;

      if (el.id === 'full_name' && v.split(/\s+/).filter(function (p) { return p.length >= 2; }).length < 2) {
        setError(el.id, 'Escribe tu nombre y tu apellido.'); firstBad = firstBad || el;
      }
      if (el.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) {
        setError(el.id, 'Escribe un correo con este formato: tu@correo.com'); firstBad = firstBad || el;
      }
      if (el.id === 'phone' && v.replace(/\D/g, '').length !== 10) {
        setError(el.id, 'Escribe los 10 dígitos de tu WhatsApp, sin el código de país.');
        firstBad = firstBad || el;
      }
      if (el.id === 'postal_code' && !/^\d{5}$/.test(v)) {
        setError(el.id, 'Escribe el código postal de 5 dígitos.'); firstBad = firstBad || el;
      }
      if (el.id === 'motivation' && v.length < 20) {
        setError(el.id, 'Cuéntanos un poco más: al menos 20 caracteres.'); firstBad = firstBad || el;
      }
      if (el.id === 'capacity') {
        var n = Number(v);
        if (!Number.isInteger(n) || n < 2 || n > 200) {
          setError(el.id, 'Escribe un número entre 2 y 200.'); firstBad = firstBad || el;
        }
      }
    });

    // Etapa 5: los consentimientos obligatorios se comprueban aparte
    if (index === 4) {
      if (!document.getElementById('consent_agreement').checked) {
        setError('consent_agreement', 'Necesitamos tu aceptación del acuerdo de líderes.');
        firstBad = firstBad || document.getElementById('consent_agreement');
      }
      if (!document.getElementById('consent_contact').checked) {
        setError('consent_contact', 'Necesitamos tu autorización para poder escribirte.');
        firstBad = firstBad || document.getElementById('consent_contact');
      }
      if (!document.getElementById('consent_privacy').checked) {
        setError('consent_privacy', 'Necesitamos tu aceptación del aviso de privacidad.');
        firstBad = firstBad || document.getElementById('consent_privacy');
      }
      if (churchType.value !== 'sin_iglesia' && !document.getElementById('consent_pastoral').checked) {
        setError('consent_pastoral', 'Necesitamos tu autorización para contactar a tus pastores.');
        firstBad = firstBad || document.getElementById('consent_pastoral');
      }
    }

    if (firstBad) { firstBad.focus(); return false; }
    return true;
  }

  // ── Navegación ──────────────────────────────────────────
  function show(index) {
    stages.forEach(function (s, i) { s.hidden = i !== index; });
    current = index;

    bar.style.width = ((index + 1) / stages.length * 100) + '%';
    backBtn.hidden = index === 0;
    nextBtn.hidden = index === stages.length - 1;
    submitBtn.hidden = index !== stages.length - 1;

    var title = stages[index].querySelector('.stage__title');
    if (title) {
      title.focus();
      live.textContent = 'Etapa ' + (index + 1) + ' de ' + stages.length + ': ' + title.textContent;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  nextBtn.addEventListener('click', function () {
    if (!validateStage(current)) return;
    if (current === stages.length - 2) buildSummary();
    show(current + 1);
  });

  backBtn.addEventListener('click', function () { show(current - 1); });

  // Enter avanza, pero no dentro de un textarea
  form.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && current < stages.length - 1) {
      e.preventDefault();
      nextBtn.click();
    }
  });

  // ── Resumen editable ────────────────────────────────────
  var SUMMARY_MAP = [
    { stage: 0, label: 'Nombre',     get: function () { return val('full_name'); } },
    { stage: 0, label: 'Contacto',   get: function () { return val('email') + ' · ' + val('phone'); } },
    { stage: 1, label: 'Modalidad',  get: function () { return modality.value === 'linea' ? 'En línea' : 'Presencial'; } },
    { stage: 1, label: 'Zona',       get: function () { return val('zone_public') + ', ' + val('colonia') + ', ' + val('municipio'); } },
    { stage: 2, label: 'Cuándo',     get: function () { return (DIAS[val('weekday')] || '') + ' a las ' + val('time_start'); } },
    { stage: 2, label: 'Capacidad',  get: function () { return val('capacity') + ' mujeres'; } },
    { stage: 3, label: 'Iglesia',    get: function () {
        return churchType.value === 'sin_iglesia' ? 'Actualmente sin iglesia'
          : (val('church_name') || '—') + ' · ' + (val('pastors_name') || '—'); } }
  ];

  function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  function buildSummary() {
    var box = document.getElementById('summary');
    box.innerHTML = '';
    SUMMARY_MAP.forEach(function (row) {
      var div = document.createElement('div');
      div.className = 'summary__block';

      var k = document.createElement('span'); k.className = 'summary__key'; k.textContent = row.label;
      var v = document.createElement('span'); v.className = 'summary__val'; v.textContent = row.get() || '—';

      var b = document.createElement('button');
      b.type = 'button'; b.className = 'summary__edit';
      b.textContent = 'Editar';
      b.setAttribute('aria-label', 'Editar ' + row.label.toLowerCase());
      b.addEventListener('click', function () { show(row.stage); });

      div.appendChild(k); div.appendChild(v); div.appendChild(b);
      box.appendChild(div);
    });
  }

  // ── Envío ───────────────────────────────────────────────
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    formErr.textContent = '';
    if (!validateStage(current)) return;

    var tsField = document.querySelector('[name="cf-turnstile-response"]');
    var tsToken = tsField ? tsField.value : '';
    if (!tsToken) {
      formErr.textContent = 'Falta completar la verificación de seguridad. Espera un momento y vuelve a intentar.';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando…';

    var payload = {
      full_name: val('full_name'), email: val('email'), phone: val('phone'),
      motivation: val('motivation'),
      comments: val('comments'),
      modality: modality.value, estado: val('estado'), municipio: val('municipio'),
      postal_code: val('postal_code'), colonia: val('colonia'), zone_public: val('zone_public'),
      address_private: val('address_private'),
      weekday: val('weekday'), time_start: val('time_start'),
      capacity: Number(val('capacity')), group_name: val('group_name'),
      church_type: churchType.value, church_name: val('church_name'),
      pastors_name: val('pastors_name'), pastoral_contact: val('pastoral_contact'),
      comments: '',
      consent_privacy:     document.getElementById('consent_privacy').checked,
      consent_contact:     document.getElementById('consent_contact').checked,
      consent_agreement:   document.getElementById('consent_agreement').checked,
      consent_pastoral:    document.getElementById('consent_pastoral').checked,
      consent_public_name: document.getElementById('consent_public_name').checked,
      turnstile_token: tsToken
    };

    try {
      var res = await fetch('/api/groups/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey() },
        body: JSON.stringify(payload)
      });
      var data = await res.json();

      if (!res.ok || !data.ok) {
        if (data.fields) {
          Object.keys(data.fields).forEach(function (k) { setError(k, data.fields[k]); });
          formErr.textContent = 'Revisa los campos marcados y vuelve a intentar.';
        } else {
          formErr.textContent = data.message || 'No pudimos enviar tu solicitud. Vuelve a intentar en un momento.';
        }
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enviar solicitud para revisión';
        if (window.turnstile) window.turnstile.reset();
        return;
      }

      form.hidden = true;
      document.querySelector('.progress').hidden = true;
      success.hidden = false;
      document.getElementById('folio').textContent = data.folio;
      document.getElementById('ts').focus();
      live.textContent = 'Solicitud enviada. Tu folio es ' + data.folio;

    } catch (err) {
      formErr.textContent = 'No pudimos conectar. Revisa tu conexión y vuelve a intentar.';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Enviar solicitud para revisión';
    }
  });

  /* Clave de idempotencia estable durante esta sesión de captura:
     si la usuaria toca "Enviar" dos veces, no se crean dos solicitudes.
     No guarda ningún dato personal. */
  function idempotencyKey() {
    try {
      var k = sessionStorage.getItem('lbyn_grupos_idem');
      if (!k) {
        k = 'idem_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
        sessionStorage.setItem('lbyn_grupos_idem', k);
      }
      return k;
    } catch (e) {
      return 'idem_' + Date.now();
    }
  }

  /* El teclado virtual no debe tapar el campo activo:
     mientras está abierto, el botón deja de estar pegado abajo. */
  if (window.visualViewport) {
    var base = window.visualViewport.height;
    window.visualViewport.addEventListener('resize', function () {
      var open = window.visualViewport.height < base * 0.8;
      document.body.classList.toggle('keyboard-open', open);
    });
  }

  show(0);
})();
