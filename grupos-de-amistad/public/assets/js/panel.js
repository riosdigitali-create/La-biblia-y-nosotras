/* ═══════════════════════════════════════════════════════════════
   Panel interno — una sola cuenta administradora.
   Toda la autorización real vive en el servidor. Este archivo solo
   dibuja lo que el servidor le permite ver.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var CSRF = null;
  var activeView = 'login';
  var $ = function (id) { return document.getElementById(id); };

  var DIAS = { lunes:'Lunes', martes:'Martes', miercoles:'Miércoles', jueves:'Jueves',
    viernes:'Viernes', sabado:'Sábado', domingo:'Domingo' };

  var ESTADO_BADGE = {
    PENDING_REVIEW:            ['badge--wait',  '◷', 'En revisión'],
    NEEDS_CORRECTIONS:         ['badge--fix',   '✎', 'Correcciones'],
    PENDING_PASTORAL_APPROVAL: ['badge--pastor','✉', 'Con pastorado'],
    PASTORAL_REVIEW:           ['badge--pastor','◷', 'Revisando'],
    PASTORAL_APPROVED:         ['badge--pastor','✓', 'Confirmada'],
    PASTORAL_REJECTED:         ['badge--stop',  '✕', 'Sin confirmar'],
    PENDING_FINAL_APPROVAL:    ['badge--final', '★', 'Lista para publicar'],
    APPROVED:                  ['badge--final', '✓', 'Aprobada'],
    PUBLISHED:                 ['badge--live',  '●', 'Publicada'],
    REJECTED:                  ['badge--stop',  '✕', 'No aprobada'],
    SUSPENDED:                 ['badge--stop',  '‖', 'Suspendida'],
    FULL:                      ['badge--live',  '■', 'Sin lugares'],
    CLOSED:                    ['badge--stop',  '✕', 'Cerrada'],
    DUPLICATE:                 ['badge--stop',  '⧉', 'Duplicada']
  };

  function badge(status) {
    var b = ESTADO_BADGE[status] || ['badge--wait', '·', status];
    var s = document.createElement('span');
    s.className = 'badge ' + b[0];
    /* El color lo decide el CSS a partir del estado real, no de un
       icono: así un estado nuevo nunca queda sin distinguir. */
    s.setAttribute('data-estado', status);
    s.textContent = b[2];
    return s;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  async function api(path, options) {
    options = options || {};
    options.headers = options.headers || {};
    if (options.method && options.method !== 'GET') {
      options.headers['Content-Type'] = 'application/json';
      if (CSRF) options.headers['X-CSRF-Token'] = CSRF;
    }
    var res = await fetch(path, options);
    var data = await res.json().catch(function () { return {}; });
    return { ok: res.ok && data.ok !== false, status: res.status, data: data };
  }

  // ── Acceso ──────────────────────────────────────────────
  /* La única puerta del panel. El PIN no vive aquí: se manda al
     servidor, que lo compara contra el secreto PANEL_PIN y frena a
     los cinco fallos por IP durante quince minutos. */
  var pinForm = $('pinForm');
  if (pinForm) pinForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    $('e_pin').textContent = '';
    var btn = $('pinBtn');
    btn.disabled = true; btn.textContent = 'Entrando…';

    var r = await api('/api/admin/pin', {
      method: 'POST',
      body: JSON.stringify({ pin: $('pin').value })
    });

    btn.disabled = false; btn.textContent = 'Entrar con PIN';

    if (!r.ok) {
      $('e_pin').textContent = r.data.message || 'No pudimos entrar.';
      $('pin').value = '';
      $('pin').focus();
      return;
    }

    CSRF = r.data.csrf;
    enterPanel(r.data.user);
  });

  function enterPanel(user) {
    $('login').hidden = true;
    $('shell').hidden = false;
    $('who').textContent = user ? user.name : '';
    render('dashboard');
  }

  $('logout').addEventListener('click', async function () {
    await api('/api/admin/logout', { method: 'POST' });
    location.reload();
  });

  // Drawer accesible en móvil
  $('drawerBtn').addEventListener('click', function () {
    var nav = $('nav');
    var open = nav.classList.toggle('open');
    this.setAttribute('aria-expanded', String(open));
    if (open) nav.querySelector('.side__link').focus();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      $('nav').classList.remove('open');
      $('drawerBtn').setAttribute('aria-expanded', 'false');
    }
  });

  /* Las pestañas son <button role="tab">: no navegan, cambian de vista. */
  document.querySelectorAll('.side__link').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.side__link').forEach(function (x) {
        x.setAttribute('aria-selected', 'false');
      });
      b.setAttribute('aria-selected', 'true');
      $('nav').classList.remove('open');
      render(b.dataset.view);
    });
  });

  // ── Vistas ──────────────────────────────────────────────
  var TITLES = {
    dashboard:'Inicio', circles:'Círculos de amigas',
    applications:'Solicitudes'
  };

  async function render(view) {
    activeView = view;
    $('viewTitle').textContent = TITLES[view] || '';
    $('viewTitle').focus();
    $('viewActions').innerHTML = '';
    var box = $('view');
    box.innerHTML = '<p class="empty-state">Cargando…</p>';

    /* Tres vistas. Las de grupos, participantes, auditoría y
       exportaciones siguen escritas más abajo y sus endpoints en pie:
       para volver a enseñarlas basta con devolver su botón al menú y
       su línea aquí. */
    if (view === 'dashboard')    return renderDashboard(box);
    if (view === 'circles')      return renderCircles(box);
    if (view === 'applications') return renderApplications(box);
  }

  async function renderDashboard(box) {
    var r = await api('/api/admin/dashboard');
    if (!r.ok) { box.innerHTML = '<p class="empty-state">No se pudo cargar.</p>'; return; }
    var d = r.data;

    box.innerHTML = '';
    var board = el('div', 'board');

    // Bloque principal: la cola real, no un contador solo
    var left = el('div');
    left.appendChild(el('p', 'eyebrow', 'Requieren tu atención'));
    var queue = el('div', 'queue');
    queue.style.marginTop = 'var(--s5)';

    if (!d.pendientes.length) {
      queue.appendChild(el('p', 'empty-state', 'Nada pendiente por ahora.'));
    }
    d.pendientes.forEach(function (a) {
      var row = el('div', 'qrow');
      row.appendChild(badge(a.status));

      var mid = el('div');
      mid.appendChild(el('p', 'qrow__who', a.lider));
      mid.appendChild(el('p', 'qrow__where',
        a.municipio + ', ' + a.estado + ' · ' + (DIAS[a.weekday] || a.weekday) + ' ' + a.time_start));
      row.appendChild(mid);

      var open = el('button', 'summary__edit', 'Abrir');
      open.addEventListener('click', function () { openApplication(a.id); });
      row.appendChild(open);

      queue.appendChild(row);
    });
    left.appendChild(queue);

    // Columna de estados críticos
    var right = el('div');
    var m1 = el('div', 'metric');
    m1.appendChild(el('p', 'metric__n', String(d.solicitudes_por_estado.PENDING_REVIEW || 0)));
    m1.appendChild(el('p', 'metric__l', 'Pendientes de aceptar o rechazar'));
    right.appendChild(m1);

    var m2 = el('div', 'metric');
    m2.appendChild(el('p', 'metric__n', String(d.grupos.publicados || 0)));
    m2.appendChild(el('p', 'metric__l', 'Grupos publicados'));
    right.appendChild(m2);

    var m3 = el('div', 'metric');
    m3.appendChild(el('p', 'metric__n', (d.grupos.ocupados || 0) + '/' + (d.grupos.capacidad || 0)));
    m3.appendChild(el('p', 'metric__l', 'Lugares ocupados'));
    right.appendChild(m3);

    var m4 = el('div', 'metric');
    m4.appendChild(el('p', 'metric__n', String(d.lista_espera || 0)));
    m4.appendChild(el('p', 'metric__l', 'En lista de espera'));
    right.appendChild(m4);

    board.appendChild(left); board.appendChild(right);
    box.appendChild(board);

    // Franja de actividad reciente
    var act = el('div');
    act.style.marginTop = 'var(--s9)';
    act.appendChild(el('p', 'eyebrow', 'Actividad reciente'));
    var list = el('div', 'queue');
    list.style.marginTop = 'var(--s5)';
    d.actividad.slice(0, 8).forEach(function (a) {
      var row = el('div', 'qrow');
      row.appendChild(el('span', 'qrow__folio', a.action));
      row.appendChild(el('span', 'qrow__where', a.entity_type));
      row.appendChild(el('span', 'qrow__where', new Date(a.created_at).toLocaleString('es-MX')));
      list.appendChild(row);
    });
    act.appendChild(list);
    box.appendChild(act);
  }


  /* ── Círculos de amigas ─────────────────────────────────────
     Las cuatro preguntas del equipo: cuántos llevamos, de qué
     iglesias vienen, en qué ciudades están y a qué pastora hay
     que avisar. */
  async function renderCircles(box) {
    var r = await api('/api/admin/circles');
    if (!r.ok) { box.innerHTML = '<p class="empty-state">No se pudo cargar.</p>'; return; }
    var d = r.data;

    box.innerHTML = '';

    /* Los números de arriba. */
    var cifras = el('div', 'cifras');
    [['Círculos', d.total], ['Hoy', d.hoy], ['Últimos 7 días', d.semana],
     ['Sin seguimiento', d.sinSeguimiento]].forEach(function (par) {
      var c = el('div', 'cifra');
      c.appendChild(el('p', 'cifra__n', String(par[1])));
      c.appendChild(el('p', 'cifra__t', par[0]));
      cifras.appendChild(c);
    });
    box.appendChild(cifras);

    /* Avisos a pastoras: lo primero, porque es lo accionable. */
    var avisos = el('section', 'bloque');
    avisos.appendChild(el('p', 'eyebrow', 'Avisar a la pastora'));
    if (!d.avisos.length) {
      avisos.appendChild(el('p', 'empty-state',
        'Todavía ninguna iglesia junta suficientes círculos.'));
    } else {
      d.avisos.forEach(function (a) {
        var row = el('div', 'qrow');
        var mid = el('div');
        mid.appendChild(el('p', 'qrow__who', a.iglesia));
        mid.appendChild(el('p', 'qrow__where',
          a.n + ' círculos registrados · umbral de ' + a.umbral));
        row.appendChild(mid);
        row.appendChild(el('span', 'pendiente', 'Envío por conectar'));
        avisos.appendChild(row);
      });
      avisos.appendChild(el('p', 'nota-pie',
        'El correo automático se enciende cuando haya proveedor. ' +
        'Mientras tanto, ningún aviso se pierde: quedan aquí.'));
    }
    box.appendChild(avisos);

    /* Por iglesia y por ciudad, lado a lado. */
    var par = el('div', 'dos-columnas');

    var igl = el('section', 'bloque');
    igl.appendChild(el('p', 'eyebrow', 'Por iglesia'));
    if (!d.porIglesia.length) igl.appendChild(el('p', 'empty-state', 'Sin registros todavía.'));
    d.porIglesia.forEach(function (x) {
      var row = el('div', 'linea-dato');
      row.appendChild(el('span', 'linea-dato__t', x.iglesia));
      row.appendChild(el('span', 'linea-dato__n', String(x.n)));
      igl.appendChild(row);
    });
    par.appendChild(igl);

    var ciu = el('section', 'bloque');
    ciu.appendChild(el('p', 'eyebrow', 'Por ciudad'));
    if (!d.porCiudad.length) ciu.appendChild(el('p', 'empty-state', 'Sin registros todavía.'));
    d.porCiudad.forEach(function (x) {
      var row = el('div', 'linea-dato');
      row.appendChild(el('span', 'linea-dato__t', x.ciudad));
      row.appendChild(el('span', 'linea-dato__n', String(x.n)));
      ciu.appendChild(row);
    });
    par.appendChild(ciu);

    box.appendChild(par);
  }

  async function renderApplications(box) {
    var r = await api('/api/admin/applications');
    if (!r.ok) { box.innerHTML = '<p class="empty-state">No se pudo cargar.</p>'; return; }
    box.innerHTML = '';
    var q = el('div', 'queue');
    if (!r.data.items.length) q.appendChild(el('p', 'empty-state', 'Todavía no hay solicitudes.'));
    r.data.items.forEach(function (a) {
      var row = el('div', 'qrow');
      row.appendChild(badge(a.status));
      var mid = el('div');
      mid.appendChild(el('p', 'qrow__folio', a.folio));
      mid.appendChild(el('p', 'qrow__who', a.lider));
      mid.appendChild(el('p', 'qrow__where',
        a.zone_public + ' · ' + a.municipio + ', ' + a.estado));
      row.appendChild(mid);
      var open = el('button', 'summary__edit', 'Abrir');
      open.addEventListener('click', function () { openApplication(a.id); });
      row.appendChild(open);
      q.appendChild(row);
    });
    box.appendChild(q);
  }

  // ── Detalle de solicitud ────────────────────────────────
  async function openApplication(id) {
    activeView = 'application-detail';
    var box = $('view');
    $('viewTitle').textContent = 'Solicitud';
    box.innerHTML = '<p class="empty-state">Cargando…</p>';

    var r = await api('/api/admin/applications/' + id);
    if (!r.ok) { box.innerHTML = '<p class="empty-state">No se pudo cargar.</p>'; return; }

    var s = r.data.solicitud;
    box.innerHTML = '';
    var head = el('div');
    head.appendChild(badge(s.status));
    head.appendChild(el('p', 'heading-md', s.folio));
    box.appendChild(head);

    var sum = el('div', 'summary');
    sum.style.marginTop = 'var(--s6)';
    function row(k, v) {
      var d = el('div', 'summary__block');
      d.appendChild(el('span', 'summary__key', k));
      d.appendChild(el('span', 'summary__val', v || '—'));
      sum.appendChild(d);
    }
    function fecha(iso) {
      if (!iso) return '';
      try {
        return new Date(iso).toLocaleString('es-MX', {
          day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit'
        });
      } catch (e) { return iso; }
    }

    var IGLESIA = { rio:'Río (la nuestra)', otra:'Otra iglesia', sin_iglesia:'Actualmente sin iglesia' };

    /* Todo lo que dejó escrito, en el orden en que hace falta leerlo:
       quién es, cómo localizarla, de dónde viene, dónde y cuándo se
       reúnen, y qué autorizó. Nada se resume ni se recorta: esta
       ficha es el único sitio donde se ven los datos privados, y se
       decide sobre ella. */

    row('Recibida', fecha(s.created_at));
    row('Líder', s.full_name);
    row('Nombre público', s.public_name_authorized
      ? (s.public_name || s.full_name) + ' (autorizado)'
      : 'No autorizó publicar su nombre');
    row('Correo', s.email);
    row('WhatsApp', s.phone_e164);

    row('Iglesia', IGLESIA[s.church_type] || s.church_type);
    if (s.church_type !== 'sin_iglesia') row('Nombre de la iglesia', s.church_name);
    row('Pastores', s.pastors_name);
    row('Contacto pastoral', s.pastoral_contact);

    row('Nombre del círculo', s.group_name);
    row('Modalidad', s.modality === 'linea' ? 'En línea' : 'Presencial');
    row('Cuándo', (DIAS[s.weekday] || s.weekday) + ' a las ' + s.time_start);
    row('Capacidad', s.capacity + ' mujeres');

    row('Estado y municipio', s.municipio + ', ' + s.estado);
    row('Colonia y código postal', (s.colonia || '') + (s.postal_code ? ' · CP ' + s.postal_code : ''));
    row('Referencia pública', s.zone_public);
    row('Dirección (uso interno)', s.address_private);

    row('Por qué quiere abrirlo', s.motivation);
    if (s.comments) row('Comentarios', s.comments);

    row('Permisos', [
      'Aviso de privacidad',
      'Contacto',
      'Acuerdo de líder',
      'Contacto pastoral',
    ].join(' · ') + ' — aceptados el ' + fecha(s.created_at));
    row('Versiones firmadas', 'Consentimiento ' + (s.consent_version || '—') +
      ' · Acuerdo ' + (s.agreement_version || '—'));

    if (s.review_notes)     row('Notas internas', s.review_notes);
    if (s.rejection_reason) row('Motivo del rechazo', s.rejection_reason);

    box.appendChild(sum);

    // La metodología de LBYN: aceptar publica; rechazar no publica.
    var moderables = [
      'PENDING_REVIEW', 'NEEDS_CORRECTIONS', 'PENDING_PASTORAL_APPROVAL',
      'PASTORAL_REVIEW', 'PASTORAL_APPROVED', 'PASTORAL_REJECTED',
      'PENDING_FINAL_APPROVAL', 'APPROVED'
    ];

    if (moderables.indexOf(s.status) >= 0) {
      var pub = el('div', 'publish');
      pub.appendChild(el('p', 'eyebrow', 'Decisión del panel'));
      var ul = el('ul', 'publish__req');
      ul.style.marginTop = 'var(--s4)';
      ul.appendChild(el('li', 'met', 'La solicitud fue revisada por el equipo'));
      ul.appendChild(el('li', 'met', 'Al aceptar aparecerá inmediatamente en la búsqueda'));
      pub.appendChild(ul);

      var btn = el('button', 'btn btn--primary', 'Aceptar y publicar grupo');
      btn.addEventListener('click', async function () {
        if (!confirm('El grupo quedará publicado y disponible por código postal inmediatamente. ¿Confirmas?')) return;
        btn.disabled = true; btn.textContent = 'Publicando…';
        var res = await api('/api/admin/applications/' + id + '/final-approve', {
          method: 'POST', body: JSON.stringify({ confirm: true })
        });
        if (res.ok) { render('applications'); }
        else { btn.disabled = false; btn.textContent = 'Aceptar y publicar grupo';
               alert(res.data.message || 'No se pudo publicar.'); }
      });
      pub.appendChild(btn);
      box.appendChild(pub);
    }

    // Acciones de proceso
    var acts = el('div', 'actions');
    acts.style.marginTop = 'var(--s7)';

    var fix = el('button', 'btn', 'Pedir correcciones');
    fix.addEventListener('click', async function () {
      var notes = prompt('¿Qué necesita corregir la líder? Se le enviará este texto.');
      if (!notes || notes.trim().length < 10) return;
      var res = await api('/api/admin/applications/' + id + '/request-corrections', {
        method: 'POST', body: JSON.stringify({ notes: notes })
      });
      if (res.ok) openApplication(id); else alert(res.data.message || 'No se pudo.');
    });
    acts.appendChild(fix);

    var back = el('button', 'summary__edit', '← Volver a solicitudes');
    back.addEventListener('click', function () { render('applications'); });
    acts.appendChild(back);
    box.appendChild(acts);

    if (moderables.indexOf(s.status) >= 0) {
      // Zona peligrosa — separada de la acción primaria
      var dz = el('div', 'danger-zone');
      dz.appendChild(el('p', 'danger-zone__title', 'Rechazar solicitud'));
      var rej = el('button', 'btn btn--danger', 'Rechazar grupo');
      rej.addEventListener('click', async function () {
        var reason = prompt('Motivo del rechazo (queda registrado):');
        if (!reason || reason.trim().length < 10) return;
        if (!confirm('¿Confirmas el rechazo de esta solicitud?')) return;
        var res = await api('/api/admin/applications/' + id + '/reject', {
          method: 'POST', body: JSON.stringify({ confirm: true, reason: reason })
        });
        if (res.ok) render('applications'); else alert(res.data.message || 'No se pudo.');
      });
      dz.appendChild(rej);
      box.appendChild(dz);
    }
  }

  async function renderGroups(box) {
    var r = await api('/api/admin/groups');
    if (!r.ok) { box.innerHTML = '<p class="empty-state">No se pudo cargar.</p>'; return; }
    box.innerHTML = '';
    var q = el('div', 'queue');
    if (!r.data.items.length) q.appendChild(el('p', 'empty-state', 'Todavía no hay grupos publicados.'));
    r.data.items.forEach(function (g) {
      var row = el('div', 'qrow');
      row.appendChild(badge(g.editorial_status));
      var mid = el('div');
      mid.appendChild(el('p', 'qrow__who', g.public_name || 'Grupo de amistad'));
      mid.appendChild(el('p', 'qrow__where',
        g.zone_public + ' · ' + g.municipio + ' · ' + (DIAS[g.weekday] || g.weekday) + ' ' + g.time_start));
      row.appendChild(mid);
      row.appendChild(el('span', 'qrow__where', g.occupied + '/' + g.capacity));
      row.appendChild(accionesGrupo(g, box));
      q.appendChild(row);
    });
    box.appendChild(q);
  }

  /**
   * Controles de un grupo ya publicado.
   *
   * La publicación no se toca desde aquí: eso solo ocurre por la doble
   * aprobación en la solicitud. Aquí se administra lo que pasa DESPUÉS.
   * Reactivar exige confirmación pastoral vigente; lo comprueba el servidor
   * (SUSPENDED → PUBLISHED requiere aprobación pastoral en state_transitions).
   */
  function accionesGrupo(g, box) {
    var caja = el('div', 'qrow__acciones');

    function pedir(cuerpo, texto, confirmar) {
      var b = el('button', 'btn btn--small', texto);
      b.addEventListener('click', async function () {
        if (confirmar && !confirm(confirmar)) return;
        b.disabled = true;
        var res = await api('/api/admin/groups/' + g.id, {
          method: 'PATCH', body: JSON.stringify(cuerpo)
        });
        if (res.ok) { renderGroups(box); }
        else { b.disabled = false; alert(res.data.message || 'No se pudo hacer el cambio.'); }
      });
      caja.appendChild(b);
    }

    var estado = g.editorial_status;

    if (estado === 'PUBLISHED' || estado === 'FULL') {
      pedir(
        { editorial_status: 'SUSPENDED', confirm: true, reason: 'Suspendido desde el panel' },
        'Suspender',
        'El grupo dejará de aparecer en la búsqueda pública. ¿Confirmas?'
      );
    }

    if (estado === 'SUSPENDED') {
      pedir(
        { editorial_status: 'PUBLISHED', confirm: true },
        'Reactivar',
        'El grupo volverá a aparecer en la búsqueda pública. ¿Confirmas?'
      );
    }

    if (estado !== 'CLOSED') {
      pedir(
        { editorial_status: 'CLOSED', confirm: true },
        'Cerrar',
        'Cerrar es definitivo: el grupo deja de existir de cara al público. ¿Confirmas?'
      );

      var cap = el('button', 'btn btn--small', 'Capacidad');
      cap.addEventListener('click', async function () {
        var v = prompt('Nueva capacidad (hoy: ' + g.capacity + ', apuntadas: ' + g.occupied + ')', String(g.capacity));
        if (v === null) return;
        var n = parseInt(v, 10);
        if (!(n >= 1 && n <= 200)) { alert('La capacidad debe estar entre 1 y 200.'); return; }
        cap.disabled = true;
        var res = await api('/api/admin/groups/' + g.id, {
          method: 'PATCH', body: JSON.stringify({ capacity: n })
        });
        if (res.ok) { renderGroups(box); }
        else { cap.disabled = false; alert(res.data.message || 'No se pudo cambiar la capacidad.'); }
      });
      caja.appendChild(cap);
    }

    return caja;
  }

  var MODALIDAD = { presencial:'Presencial', linea:'En línea', cualquiera:'Cualquiera' };
  var HORARIOS  = { manana:'Mañana', tarde:'Tarde', noche:'Noche' };
  var COMUNIDAD = { si:'ya pertenece', no:'todavía no', antes:'iba antes' };

  /* pref_weekdays y pref_times se guardan como JSON en una columna de texto. */
  function listaJson(v) {
    if (Array.isArray(v)) return v;
    try { var a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }

  async function renderParticipants(box, onlyWaitlist) {
    var r = await api('/api/admin/participants' + (onlyWaitlist ? '?espera=1' : ''));
    if (!r.ok) { box.innerHTML = '<p class="empty-state">No se pudo cargar.</p>'; return; }
    box.innerHTML = '';
    var q = el('div', 'queue');
    if (!r.data.items.length) {
      q.appendChild(el('p', 'empty-state', onlyWaitlist ? 'Nadie en lista de espera.' : 'Todavía no hay participantes.'));
    }
    r.data.items.forEach(function (p) {
      var row = el('div', 'qrow');
      row.appendChild(el('span', 'qrow__where', new Date(p.created_at).toLocaleDateString('es-MX')));
      var mid = el('div');
      mid.appendChild(el('p', 'qrow__who', p.full_name));
      mid.appendChild(el('p', 'qrow__where', p.colonia + ', ' + p.municipio + ', ' + p.estado + ' · CP ' + p.postal_code));

      // Perfil: edad, disponibilidad y si ya pertenece a una comunidad.
      var perfil = [];
      if (p.age_range) perfil.push(p.age_range + ' años');
      if (p.pref_modality) perfil.push(MODALIDAD[p.pref_modality] || p.pref_modality);
      var dias = listaJson(p.pref_weekdays).map(function (d) { return DIAS[d] || d; });
      var horas = listaJson(p.pref_times).map(function (h) { return HORARIOS[h] || h; });
      if (dias.length) perfil.push(dias.join(', '));
      if (horas.length) perfil.push(horas.join(' / '));
      if (perfil.length) mid.appendChild(el('p', 'qrow__where', perfil.join(' · ')));

      if (p.has_community) {
        mid.appendChild(el('p', 'qrow__where',
          'Comunidad: ' + (COMUNIDAD[p.has_community] || p.has_community) +
          (p.community_name ? ' — ' + p.community_name : '')));
      }
      row.appendChild(mid);
      row.appendChild(el('span', 'qrow__where', p.solicitudes + ' solicitud(es)'));
      q.appendChild(row);
    });
    box.appendChild(q);
  }

  async function renderAudit(box) {
    var r = await api('/api/admin/audit');
    if (!r.ok) { box.innerHTML = '<p class="empty-state">No se pudo cargar.</p>'; return; }
    box.innerHTML = '';
    var q = el('div', 'queue');
    r.data.items.forEach(function (a) {
      var row = el('div', 'qrow');
      row.appendChild(el('span', 'qrow__folio', a.action));
      var mid = el('div');
      mid.appendChild(el('p', 'qrow__where', a.entity_type + ' · ' + a.actor_type));
      if (a.after_summary) mid.appendChild(el('p', 'qrow__where', a.after_summary));
      row.appendChild(mid);
      row.appendChild(el('span', 'qrow__where', new Date(a.created_at).toLocaleString('es-MX')));
      q.appendChild(row);
    });
    box.appendChild(q);
  }

  function renderExports(box) {
    box.innerHTML = '';
    box.appendChild(el('p', 'field__help',
      'Los archivos se descargan protegidos contra inyección de fórmulas. No incluyen dirección, teléfono ni correo.'));
    var acts = el('div', 'actions');
    [['grupos','Grupos'], ['solicitudes','Solicitudes'], ['espera','Lista de espera']].forEach(function (x) {
      var a = el('a', 'btn', 'Descargar ' + x[1]);
      a.href = '/api/admin/exports/' + x[0];
      acts.appendChild(a);
    });
    box.appendChild(acts);
  }

  // Actualización continua de las colas visibles. No recarga una ficha
  // abierta para no interrumpir a quien está revisando sus datos.
  var refreshing = false;
  async function refreshActiveView() {
    if (refreshing || document.hidden || $('shell').hidden) return;
    if (activeView !== 'dashboard' && activeView !== 'applications') return;

    refreshing = true;
    try {
      if (activeView === 'dashboard') await renderDashboard($('view'));
      if (activeView === 'applications') await renderApplications($('view'));
    } finally {
      refreshing = false;
    }
  }

  window.setInterval(refreshActiveView, 5000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) refreshActiveView();
  });

  // Sesión ya abierta
  (async function () {
    var s = await api('/api/admin/session');
    if (s.ok) {
      if (s.data.auth_mode === 'access') { CSRF = ''; enterPanel(s.data.user); }
      else { $('loginTitle').focus(); }
    } else {
      $('loginTitle').focus();
    }
  })();
})();
