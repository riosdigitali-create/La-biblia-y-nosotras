/* Flujo de la participante: 3 etapas + resultados. */
(function () {
  'use strict';

  var ESTADOS = ['Aguascalientes','Baja California','Baja California Sur','Campeche','Chiapas',
    'Chihuahua','Ciudad de México','Coahuila','Colima','Durango','Estado de México','Guanajuato',
    'Guerrero','Hidalgo','Jalisco','Michoacán','Morelos','Nayarit','Nuevo León','Oaxaca','Puebla',
    'Querétaro','Quintana Roo','San Luis Potosí','Sinaloa','Sonora','Tabasco','Tamaulipas',
    'Tlaxcala','Veracruz','Yucatán','Zacatecas'];

  var DIAS = { lunes:'Lunes', martes:'Martes', miercoles:'Miércoles', jueves:'Jueves',
    viernes:'Viernes', sabado:'Sábado', domingo:'Domingo' };

  var form = document.getElementById('form');
  var stages = Array.prototype.slice.call(document.querySelectorAll('.stage'));
  var bar = document.getElementById('bar');
  var backBtn = document.getElementById('back');
  var nextBtn = document.getElementById('next');
  var submitBtn = document.getElementById('submit');
  var formErr = document.getElementById('e_form');
  var current = 0;
  var participantId = null;
  var joinToken = null;
  var params = new URLSearchParams(window.location.search);
  var requestedGroupId = params.get('grupo');
  var requestedPostalCode = params.get('cp');

  var live = document.createElement('p');
  live.className = 'sr-only'; live.setAttribute('aria-live', 'polite');
  document.body.appendChild(live);

  var estadoSel = document.getElementById('estado');
  estadoSel.appendChild(new Option('Elige tu estado', ''));
  ESTADOS.forEach(function (e) { estadoSel.appendChild(new Option(e, e)); });

  if (requestedPostalCode && /^\d{5}$/.test(requestedPostalCode)) {
    document.getElementById('postal_code').value = requestedPostalCode;
  }
  if (requestedGroupId) {
    submitBtn.textContent = 'Enviar y solicitar unirme';
  }

  function val(id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
  function setError(name, msg) {
    var box = document.getElementById('e_' + name);
    var el = document.getElementById(name);
    if (box) box.textContent = msg;
    if (el && el.closest('.field')) el.closest('.field').classList.add('field--error');
  }

  function validateStage(i) {
    var stage = stages[i];
    stage.querySelectorAll('.field--error').forEach(function (f) { f.classList.remove('field--error'); });
    stage.querySelectorAll('.field__error').forEach(function (e) { e.textContent = ''; });
    var bad = null;

    stage.querySelectorAll('input, select').forEach(function (el) {
      if (el.type === 'checkbox') return;
      var v = (el.value || '').trim();
      if (el.required && !v) { setError(el.id, 'Este dato es necesario para continuar.'); bad = bad || el; return; }
      if (!v) return;
      if (el.id === 'full_name' && v.split(/\s+/).filter(function (p) { return p.length >= 2; }).length < 2) {
        setError(el.id, 'Escribe tu nombre y tu apellido.'); bad = bad || el;
      }
      if (el.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) {
        setError(el.id, 'Escribe un correo con este formato: tu@correo.com'); bad = bad || el;
      }
      if (el.id === 'phone' && v.replace(/\D/g, '').length !== 10) {
        setError(el.id, 'Escribe los 10 dígitos de tu WhatsApp.'); bad = bad || el;
      }
      if (el.id === 'postal_code' && !/^\d{5}$/.test(v)) {
        setError(el.id, 'Escribe el código postal de 5 dígitos.'); bad = bad || el;
      }
    });

    if (i === 2) {
      if (!document.getElementById('consent_privacy').checked) {
        setError('consent_privacy', 'Necesitamos tu aceptación para continuar.');
        bad = bad || document.getElementById('consent_privacy');
      }
      if (!document.getElementById('consent_contact').checked) {
        setError('consent_contact', 'Necesitamos tu autorización para poder avisarte.');
        bad = bad || document.getElementById('consent_contact');
      }
      var hc = document.getElementById('has_community');
      var cn = document.getElementById('community_name');
      if (hc && hc.value === 'si' && cn && !cn.value.trim()) {
        setError('community_name', 'Escribe el nombre de tu comunidad o de tu líder.');
        bad = bad || cn;
      }
    }

    if (bad) { bad.focus(); return false; }
    return true;
  }

  // El nombre de la comunidad solo se pide a quien dice que ya pertenece a una.
  var hasCom = document.getElementById('has_community');
  var wrapCom = document.getElementById('wrap_community_name');
  if (hasCom && wrapCom) {
    hasCom.addEventListener('change', function () {
      var pide = hasCom.value === 'si';
      wrapCom.hidden = !pide;
      document.getElementById('community_name').required = pide;
    });
  }

  function marcados(nombre) {
    return Array.prototype.slice
      .call(document.querySelectorAll('input[name="' + nombre + '"]:checked'))
      .map(function (el) { return el.value; });
  }

  function show(i) {
    stages.forEach(function (s, k) { s.hidden = k !== i; });
    current = i;
    bar.style.width = ((i + 1) / 4 * 100) + '%';
    backBtn.hidden = i === 0;
    nextBtn.hidden = i === stages.length - 1;
    submitBtn.hidden = i !== stages.length - 1;
    var t = stages[i].querySelector('.stage__title');
    if (t) { t.focus(); live.textContent = 'Etapa ' + (i + 1) + ' de 4: ' + t.textContent; }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  nextBtn.addEventListener('click', function () { if (validateStage(current)) show(current + 1); });
  backBtn.addEventListener('click', function () { show(current - 1); });

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    formErr.textContent = '';
    if (!validateStage(current)) return;

    var tsField = document.querySelector('[name="cf-turnstile-response"]');
    var tsToken = tsField ? tsField.value : '';
    if (!tsToken) { formErr.textContent = 'Falta completar la verificación de seguridad.'; return; }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Buscando…';

    try {
      var reg = await fetch('/api/participants/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: val('full_name'), email: val('email'), phone: val('phone'),
          estado: val('estado'), municipio: val('municipio'),
          postal_code: val('postal_code'), colonia: val('colonia'),
          pref_modality: val('pref_modality'),
          age_range: val('age_range'),
          pref_weekdays: marcados('pref_weekdays'),
          pref_times: marcados('pref_times'),
          has_community: val('has_community'),
          community_name: val('community_name'),
          comments: val('comments'),
          consent_privacy: document.getElementById('consent_privacy').checked,
          consent_contact: document.getElementById('consent_contact').checked,
          turnstile_token: tsToken
        })
      });
      var regData = await reg.json();
      if (!reg.ok || !regData.ok) {
        if (regData.fields) Object.keys(regData.fields).forEach(function (k) { setError(k, regData.fields[k]); });
        formErr.textContent = regData.message || 'No pudimos guardar tus datos.';
        submitBtn.disabled = false; submitBtn.textContent = 'Ver grupos cerca de mí';
        if (window.turnstile) window.turnstile.reset();
        return;
      }
      participantId = regData.participant_id;
      joinToken = regData.join_token;

      // El servidor aceptó la escritura: solo ahora se confirma la recepción.
      var conf = document.getElementById('confirmacion');
      if (conf) {
        var pila = val('full_name').split(/\s+/)[0] || '';
        conf.textContent = '¡Gracias' + (pila ? ', ' + pila : '') + '! \u{1F90D} Recibimos tu información. ' +
          'Nuestro equipo revisará cuál es la comunidad más adecuada para ti y se pondrá en contacto ' +
          'contigo por WhatsApp. Nos emociona mucho que hayas decidido caminar acompañada durante ' +
          'estas seis semanas.';
        conf.hidden = false;
      }

      var q = new URLSearchParams({
        cp: val('postal_code'), colonia: val('colonia'),
        municipio: val('municipio'), estado: val('estado')
      });
      if (val('pref_modality') !== 'cualquiera') q.set('modalidad', val('pref_modality'));

      var res = await fetch('/api/groups/search?' + q.toString());
      var data = await res.json();

      form.hidden = true;
      document.querySelector('.progress').hidden = true;
      document.getElementById('resultsWrap').hidden = false;
      bar.style.width = '100%';
      renderResults(data.resultados || []);
      document.getElementById('t4').focus();

      if (requestedGroupId) {
        var selectedButton = document.querySelector('[data-group-id="' + requestedGroupId + '"]');
        if (selectedButton) {
          var selectedSeats = selectedButton.closest('.invite').querySelector('.invite__seats');
          await join(requestedGroupId, selectedButton, selectedSeats);
        } else {
          var confSelected = document.getElementById('confirmacion');
          confSelected.textContent = 'El grupo que elegiste ya no está disponible. Te mostramos otras opciones cerca de ti.';
          confSelected.hidden = false;
        }
        requestedGroupId = null;
      }

    } catch (err) {
      formErr.textContent = 'No pudimos conectar. Revisa tu conexión y vuelve a intentar.';
      submitBtn.disabled = false; submitBtn.textContent = 'Ver grupos cerca de mí';
    }
  });

  function renderResults(items) {
    var box = document.getElementById('results');
    var empty = document.getElementById('empty');
    box.innerHTML = '';

    if (!items.length) {
      empty.hidden = false;
      live.textContent = 'No encontramos grupos disponibles en tu zona.';
      return;
    }
    live.textContent = 'Encontramos ' + items.length + ' grupo(s) cerca de ti.';

    items.forEach(function (g) {
      var row = document.createElement('article');
      row.className = 'invite';

      var main = document.createElement('div');
      var h = document.createElement('h3');
      h.className = 'invite__name'; h.textContent = g.nombre;

      var where = document.createElement('p');
      where.className = 'invite__where';
      where.textContent = g.zona + ' · ' + g.colonia + ', ' + g.municipio;

      var when = document.createElement('p');
      when.className = 'invite__when';

      var day = document.createElement('span');
      day.textContent = (DIAS[g.dia] || g.dia) + ' · ' + g.horario;

      /* Modalidad con icono + texto. Nunca solo color. */
      var mode = document.createElement('span');
      mode.className = 'invite__mode';
      mode.textContent = (g.modalidad === 'linea' ? '🖥 En línea' : '🏠 Presencial');

      when.appendChild(day); when.appendChild(mode);
      main.appendChild(h); main.appendChild(where); main.appendChild(when);

      var side = document.createElement('div');
      side.className = 'invite__side';
      var seats = document.createElement('p');
      seats.className = 'invite__seats'; seats.textContent = g.cupo_texto;

      var btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'btn btn--primary';
      btn.dataset.groupId = g.id;
      btn.textContent = 'Solicitar unirme';
      btn.addEventListener('click', function () { join(g.id, btn, seats); });

      side.appendChild(seats); side.appendChild(btn);
      row.appendChild(main); row.appendChild(side);
      box.appendChild(row);
    });
  }

  async function join(groupId, btn, seatsEl) {
    btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      var res = await fetch('/api/groups/' + groupId + '/join', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participant_id: participantId,
          join_token: joinToken
        })
      });
      var data = await res.json();
      if (res.ok && data.ok) {
        btn.textContent = 'Solicitud enviada ✓';
        seatsEl.textContent = 'Te contactaremos para confirmar.';
        live.textContent = 'Solicitud enviada. Te contactaremos para confirmar.';
      } else {
        btn.disabled = false; btn.textContent = 'Solicitar unirme';
        seatsEl.textContent = data.message || 'No se pudo apartar tu lugar.';
      }
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Solicitar unirme';
    }
  }

  document.getElementById('waitBtn').addEventListener('click', async function () {
    var b = this; b.disabled = true; b.textContent = 'Registrando…';
    try {
      var res = await fetch('/api/participants/waitlist', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participant_id: participantId })
      });
      var data = await res.json();
      document.getElementById('waitMsg').textContent = data.mensaje || 'Listo, te avisamos.';
      b.textContent = 'Listo ✓';
    } catch (e) {
      b.disabled = false; b.textContent = 'Avísenme cuando haya uno';
    }
  });

  if (window.visualViewport) {
    var base = window.visualViewport.height;
    window.visualViewport.addEventListener('resize', function () {
      document.body.classList.toggle('keyboard-open', window.visualViewport.height < base * 0.8);
    });
  }

  show(0);
})();
