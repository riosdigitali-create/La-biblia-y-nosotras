(() => {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const compareData = {
    lms: {
      title: 'LMS TRADICIONAL',
      items: ['Cursos y lecciones', 'Navegación genérica', 'Poco seguimiento', 'Experiencia igual para todos']
    },
    nks: {
      title: 'NEW KNIGHTS SYSTEM',
      items: ['Cada usuario tiene su propio día', 'Cada Knight tiene su perfil independiente', 'El sistema sabe qué debe hacer hoy', 'Evalúa progreso y score', 'Automatiza recordatorios', 'Conecta plataforma, IA y WhatsApp', 'Prepara el siguiente paso dentro de RSET']
    }
  };

  const journeyData = [
    ['DESCUBRIR', 'La promesa correcta llega desde campaña, contenido o recomendación.'],
    ['COMPRAR', 'Checkout simple con origen y UTMs registrados.'],
    ['CREAR CUENTA', 'Identidad segura y un solo RSET ID.'],
    ['ONBOARDING', 'Perfil, objetivos, medidas y consentimiento.'],
    ['DAY 0', 'Evaluación inicial y línea base del score.'],
    ['PROTOCOLO', 'Contenido y acciones asignadas a su contexto.'],
    ['90 DÍAS', 'El sistema entrega la prioridad de cada jornada.'],
    ['MEDIR', 'Hábitos, entrenamiento, contenido y progreso.'],
    ['REEVALUAR', 'Nuevas mediciones en Day 30 y Day 60.'],
    ['DAY 90', 'Resultado final, score y cierre del protocolo.'],
    ['CONTINUAR', 'Siguiente programa, membresía o experiencia RSET.']
  ];

  const screenData = [
    {name:'LANDING', note:'Metodología, fases, códigos, beneficios, testimonios, FAQ, checkout y WhatsApp.', html:`<p class="mock-kicker">THE NEW KNIGHTS PROTOCOL™</p><h3 class="mock-title">90 DAYS.<br>ONE PROTOCOL.</h3><div class="mock-card"><span>THE METHOD</span><strong>RESET · BUILD · REVEAL</strong><p>Un recorrido diario que conecta cuerpo, mente, visión, construcción, protección y propósito.</p></div><div class="mock-grid"><div class="mock-card"><span>PHASE 01</span><strong>RESET™</strong></div><div class="mock-card"><span>PHASE 02</span><strong>BUILD™</strong></div></div><button class="mock-button">BEGIN THE PROTOCOL →</button>`},
    {name:'LOGIN', note:'Google valida la identidad; RSET nunca almacena la contraseña.', html:`<p class="mock-kicker">SECURE ACCESS</p><h3 class="mock-title">WELCOME<br>BACK, KNIGHT.</h3><div class="mock-card" style="margin-top:90px;text-align:center;padding:28px"><span>RSET IDENTITY</span><strong>Continúa tu protocolo</strong><p>Una cuenta. Tu perfil. Tu progreso.</p></div><button class="mock-button">G &nbsp; CONTINUAR CON GOOGLE</button><p style="font-size:8px;color:#777982;text-align:center;margin-top:15px">Session protected · HttpOnly · Secure</p>`},
    {name:'ONBOARDING', note:'Siete pasos claros para llegar de la bienvenida al Day 1.', html:`<p class="mock-kicker">ONBOARDING / STEP 03 OF 07</p><h3 class="mock-title">DEFINE YOUR<br>BASELINE.</h3><div class="mock-progress"><i style="width:43%"></i></div><div class="mock-card"><span>DAY 0 ASSESSMENT</span><strong>Tu punto de partida</strong><p>Responde con honestidad. Este contexto ayuda a configurar el protocolo inicial.</p></div><div class="mock-card"><span>NEXT</span><strong>Objetivos · Medidas · Fotografías</strong></div><button class="mock-button">CONTINUAR →</button>`},
    {name:'DASHBOARD', note:'La primera respuesta siempre es: “¿Qué tengo que hacer hoy?”', html:`<p class="mock-kicker">WELCOME, GERSON</p><h3 class="mock-title">DAY 17 <small style="font-size:12px;color:#777982">/ 90</small><br><span style="color:#b7a6ff">RESET™</span></h3><div class="mock-progress"><i style="width:19%"></i></div><div class="mock-card"><span>TODAY / 03 ACTIONS</span><strong>Tu protocolo está listo.</strong><p>Entrenamiento, nutrición, desarrollo y acción diaria en un solo lugar.</p></div><div class="mock-grid"><div class="mock-card"><span>SCORE</span><strong>68.4</strong></div><div class="mock-card"><span>WEEK</span><strong>82%</strong></div></div><button class="mock-button">OPEN TODAY →</button>`},
    {name:'DAILY JOURNEY', note:'Los checkboxes de este prototipo son funcionales.', html:`<p class="mock-kicker">DAY 17 / RESET™</p><h3 class="mock-title">TODAY'S<br>PROTOCOL.</h3><button class="mock-check done"><i>✓</i><span><b>TRAIN</b><br>Push Workout · 42 min</span></button><button class="mock-check"><i></i><span><b>EAT</b><br>Plan RESET · Day 17</span></button><button class="mock-check"><i></i><span><b>DEVELOP</b><br>KING · Lesson 03</span></button><button class="mock-check"><i></i><span><b>ACTION</b><br>Dormir antes de las 23:00</span></button>`},
    {name:'TRAINING', note:'Ejercicio, series, repeticiones, tiempo, descanso, RPE, video y notas.', html:`<p class="mock-kicker">TRAIN / PUSH A</p><h3 class="mock-title">CONTROLLED<br>STRENGTH.</h3><div class="mock-card"><span>01 / DUMBBELL PRESS</span><strong>4 × 10 · RPE 8</strong><p>Tempo 3—1—1 · Rest 90 sec</p></div><div class="mock-card"><span>02 / SHOULDER PRESS</span><strong>3 × 12 · RPE 7</strong><p>Video reference available</p></div><div class="mock-card"><span>COACH NOTE</span><p>Mantén la técnica. El peso nunca reemplaza el control.</p></div><button class="mock-button">COMPLETAR ENTRENAMIENTO</button>`},
    {name:'NUTRITION', note:'Plan diario, cantidades, sustituciones, hidratación, suplementación y documentos.', html:`<p class="mock-kicker">EAT / RESET DAY 17</p><h3 class="mock-title">FUEL WITH<br>INTENTION.</h3><div class="mock-card"><span>07:30 / BREAKFAST</span><strong>Protein · Fiber · Hydration</strong><p>Ver cantidades y sustituciones autorizadas.</p></div><div class="mock-card"><span>14:00 / MAIN MEAL</span><strong>Plan RESET · Option A</strong><p>2 sustituciones disponibles</p></div><div class="mock-grid"><div class="mock-card"><span>WATER</span><strong>2.4 L</strong></div><div class="mock-card"><span>DOCS</span><strong>03</strong></div></div>`},
    {name:'ACADEMY', note:'Video, audio, texto, PDF, reflexión y evaluación organizados por código.', html:`<p class="mock-kicker">ACADEMY / KING</p><h3 class="mock-title">LESSON 03.<br>DECISION.</h3><div class="mock-card"><span>VIDEO · 08:42</span><strong>Decidir antes de sentir</strong><p>Cómo reducir fricción y ejecutar el protocolo.</p></div><div class="mock-grid"><div class="mock-card"><span>AUDIO</span><strong>06:10</strong></div><div class="mock-card"><span>PDF</span><strong>2 PAGES</strong></div></div><div class="mock-card"><span>REFLECTION</span><p>¿Qué decisión has postergado esta semana?</p></div>`},
    {name:'PROGRESS', note:'Cumplimiento, peso, medidas, hábitos y fotografías privadas comparables por fecha.', html:`<p class="mock-kicker">PROGRESS / WEEK 03</p><h3 class="mock-title">EVIDENCE,<br>NOT IMPRESSION.</h3><div class="mock-grid"><div class="mock-card"><span>DAYS</span><strong>17 / 90</strong></div><div class="mock-card"><span>COMPLIANCE</span><strong>82%</strong></div><div class="mock-card"><span>WORKOUTS</span><strong>11 / 12</strong></div><div class="mock-card"><span>HABITS</span><strong>76%</strong></div></div><div class="mock-card"><span>PRIVATE PHOTOS</span><strong>Day 0 ↔ Day 17</strong><p>Acceso temporal validado por usuario.</p></div>`},
    {name:'NEW KNIGHT SCORE™', note:'Lógica configurable para comparar Day 0, 30, 60 y 90. RSET definirá el algoritmo final.', html:`<p class="mock-kicker">NEW KNIGHT SCORE™</p><h3 class="mock-title">DAY 17<br>68.4</h3><div class="mock-radar"></div><div class="mock-grid"><div class="mock-card"><span>WARRIOR</span><strong>72</strong></div><div class="mock-card"><span>KING</span><strong>66</strong></div><div class="mock-card"><span>VISIONARY</span><strong>61</strong></div><div class="mock-card"><span>WORSHIPPER</span><strong>74</strong></div></div>`}
  ];

  const archData = {
    user:['THE KNIGHT','Una experiencia mobile first que funciona en iPhone, Android, tablet y desktop. La PWA puede instalarse y sentirse como una aplicación sin el costo inicial de dos apps nativas.'],
    pages:['CLOUDFLARE PAGES','Distribuye landing, PWA, dashboard y panel administrativo globalmente, con SSL, despliegues automáticos, versiones y rollbacks.'],
    workers:['CLOUDFLARE WORKERS API','Backend seguro para sesiones, perfiles, progreso, webhooks, permisos, automatizaciones y conexiones. Las claves privadas nunca llegan al navegador.'],
    data:['D1 + R2 + VECTORIZE','D1 organiza datos relacionales; R2 protege fotografías y archivos; Vectorize conecta la base oficial de conocimiento con la inteligencia artificial.'],
    connect:['OPENAI + META + STRIPE + EMAIL','Servicios externos conectados por APIs verificadas, con idempotencia, logs, límites de gasto, reintentos y control directo de las cuentas por RSET.']
  };

  const scopeIn = ['Landing comercial','Responsive mobile first / PWA','Stripe Checkout','Registro de campañas','Activación post-pago','Google Sign-In','Perfil individual','Roles iniciales','Onboarding','Evaluación Day 0','Dashboard del Knight','Journey configurable de 90 días','RESET · BUILD · REVEAL','Entrenamientos','Nutrición','Contenido multimedia','Checklists y hábitos','Progreso','Fotografías privadas','NEW KNIGHT SCORE™','Evaluaciones Day 0 / 30 / 60 / 90','Panel administrativo','Analytics básicos','Automatizaciones esenciales','WhatsApp Business Platform','Agente de WhatsApp con IA','NEW KNIGHTS AI COACH','Infraestructura Cloudflare','Base de datos + Storage','Deployment y pruebas','Documentación, capacitación y soporte'];
  const scopeOut = ['App nativa iOS','App nativa Android','Red social propia','Chat interno completo','Videollamadas','Streaming desarrollado desde cero','Wearables','Calorías avanzadas','Marketplace','Gamificación compleja','Competidor completo de Trainerize','RSET Academy completa','Certificaciones avanzadas','Multiidioma completo','IA médica','Producción de videos','Producción editorial de los 90 días','Integraciones no descritas'];

  function renderCompare(key) {
    const panel = $('#comparePanel');
    const data = compareData[key];
    panel.innerHTML = `<h3>${data.title}</h3><ul>${data.items.map((item, i) => `<li><span>${String(i + 1).padStart(2, '0')}</span>${item}</li>`).join('')}</ul>`;
  }

  function renderJourney() {
    $('#journeyTrack').innerHTML = journeyData.map((item, i) => `<article class="journey-step${i === 0 ? ' active' : ''}" tabindex="0"><span>${String(i + 1).padStart(2, '0')} / 11</span><h3>${item[0]}</h3><p>${item[1]}</p></article>`).join('');
  }

  function renderScreens() {
    const tabs = $('#screenTabs');
    tabs.innerHTML = screenData.map((screen, i) => `<button class="screen-tab${i === 3 ? ' active' : ''}" data-screen="${i}" role="tab"><span>${String(i + 1).padStart(2, '0')}</span>${screen.name}</button>`).join('');
    setScreen(3);
  }

  function setScreen(index) {
    const screen = screenData[index];
    $('#screenTitle').textContent = screen.name;
    $('#deviceContent').innerHTML = screen.html;
    $('#screenNote').textContent = screen.note;
    $$('.screen-tab').forEach((tab, i) => tab.classList.toggle('active', i === index));
    bindMockChecks();
  }

  function bindMockChecks() {
    $$('.mock-check').forEach(button => button.addEventListener('click', () => {
      button.classList.toggle('done');
      $('i', button).textContent = button.classList.contains('done') ? '✓' : '';
    }));
  }

  function setArch(key) {
    const data = archData[key];
    $('#archDetail').innerHTML = `<strong>${data[0]}</strong><p>${data[1]}</p>`;
    $$('.arch-node').forEach(node => node.classList.toggle('active', node.dataset.layer === key));
  }

  function renderScope(type = 'in') {
    const items = type === 'in' ? scopeIn : scopeOut;
    $('#scopeList').innerHTML = items.map(item => `<div class="scope-item ${type}"><i>${type === 'in' ? '✓' : '＋'}</i><span>${item}</span></div>`).join('');
  }

  const money = value => new Intl.NumberFormat('es-MX', {style:'currency', currency:'MXN', maximumFractionDigits:0}).format(value);
  const round50 = value => Math.round(value / 50) * 50;

  function calculateCosts() {
    const users = +$('#users').value;
    const ai = +$('#aiUse').value;
    const wa = +$('#waUse').value;
    const video = +$('#videoUse').value;
    const email = +$('#emailUse').value;
    const fx = +$('#fx').value || 16.9;
    $('#usersOut').value = users.toLocaleString('es-MX');
    $('#aiOut').value = ai; $('#waOut').value = wa; $('#videoOut').value = video; $('#emailOut').value = email;

    const cfLow = 5 * fx + users * .15;
    const cfHigh = 5 * fx + users * 4.15;
    const aiLow = users * ai * .20;
    const aiHigh = users * ai * 1.70;
    const waLow = users * wa * .25;
    const waHigh = users * wa * 3.125;
    const videoLow = users * video * (fx / 1000);
    const videoHigh = users * video * .25;
    const totalEmails = users * email;
    const emailLow = totalEmails <= 3000 ? 0 : (totalEmails / 50000) * 20 * fx * .6;
    const emailHigh = totalEmails <= 50000 ? 20 * fx : (totalEmails / 50000) * 20 * fx;
    const pairs = [[cfLow,cfHigh],[aiLow,aiHigh],[waLow,waHigh],[videoLow,videoHigh],[emailLow,emailHigh]];
    const ids = ['cfCost','aiCost','waCost','videoCost','emailCost'];
    pairs.forEach((pair, i) => { $("#" + ids[i]).textContent = `${money(round50(pair[0]))}—${money(round50(pair[1]))}`; });
    let low = pairs.reduce((sum,pair) => sum + pair[0], 0);
    let high = pairs.reduce((sum,pair) => sum + pair[1], 0);
    if (users === 100 && ai === 10 && wa === 8 && video === 60 && email === 5) { low = 800; high = 6500; }
    low = round50(low); high = round50(high);
    $('#totalCost').textContent = `${money(low)}—${money(high)}`;
    $('#perUser').textContent = `${money(low/users)}—${money(high/users)} por usuario`;
  }

  function initializeObservers() {
    const reveal = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('in-view'); reveal.unobserve(entry.target); }
    }), {threshold:.12, rootMargin:'0px 0px -35px'});
    $$('[data-reveal]').forEach(el => reveal.observe(el));

    if (!reducedMotion) {
      const counters = new IntersectionObserver(entries => entries.forEach(entry => {
        if (!entry.isIntersecting || entry.target.dataset.done) return;
        entry.target.dataset.done = '1';
        const end = +entry.target.dataset.count;
        const start = performance.now();
        const tick = now => {
          const progress = Math.min((now - start) / 1100, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          entry.target.textContent = '$' + Math.round(end * eased).toLocaleString('es-MX');
          if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }), {threshold:.5});
      $$('[data-count]').forEach(el => counters.observe(el));
    }
  }

  renderCompare('nks');
  renderJourney();
  renderScreens();
  setArch('user');
  renderScope('in');
  calculateCosts();
  initializeObservers();

  $$('.compare-tab').forEach(tab => tab.addEventListener('click', () => {
    $$('.compare-tab').forEach(item => item.classList.toggle('active', item === tab));
    renderCompare(tab.dataset.compare);
  }));
  $$('.journey-step').forEach(step => ['click','focus'].forEach(event => step.addEventListener(event, () => {
    $$('.journey-step').forEach(item => item.classList.remove('active')); step.classList.add('active');
  })));
  $$('.phase-card').forEach(card => card.addEventListener('mouseenter', () => {
    $$('.phase-card').forEach(item => item.classList.remove('active')); card.classList.add('active');
  }));
  $('#screenTabs').addEventListener('click', event => {
    const tab = event.target.closest('[data-screen]'); if (tab) setScreen(+tab.dataset.screen);
  });
  $$('.arch-node').forEach(node => node.addEventListener('click', () => setArch(node.dataset.layer)));
  $$('.scope-switch button').forEach(button => button.addEventListener('click', () => {
    $$('.scope-switch button').forEach(item => item.classList.toggle('active', item === button)); renderScope(button.dataset.scope);
  }));
  $$('.code-point').forEach(point => point.addEventListener('click', () => {
    $('.core-label small').textContent = `CODE / ${point.textContent}`;
    $('.core-label strong').textContent = point.dataset.code;
    $('.core-label span').textContent = 'Connected to Worshipper';
  }));

  $$('.phone-task').forEach(task => task.addEventListener('click', () => {
    task.classList.toggle('checked'); $('i', task).textContent = task.classList.contains('checked') ? '✓' : '○';
  }));

  $$('#calcForm input').forEach(input => input.addEventListener('input', calculateCosts));
  $$('#scenarios button').forEach(button => button.addEventListener('click', () => {
    $('#users').value = button.dataset.users;
    $$('#scenarios button').forEach(item => item.classList.toggle('active', item === button));
    calculateCosts();
  }));

  const menuButton = $('#menuButton');
  const mobileNav = $('#mobileNav');
  menuButton.addEventListener('click', () => {
    const open = !mobileNav.classList.contains('open');
    mobileNav.classList.toggle('open', open); document.body.classList.toggle('menu-open', open);
    mobileNav.setAttribute('aria-hidden', String(!open)); menuButton.setAttribute('aria-expanded', String(open));
    $('span', menuButton).textContent = open ? '×' : '＋';
  });
  $$('.mobile-nav a').forEach(link => link.addEventListener('click', () => {
    mobileNav.classList.remove('open'); document.body.classList.remove('menu-open'); mobileNav.setAttribute('aria-hidden','true'); menuButton.setAttribute('aria-expanded','false'); $('span', menuButton).textContent='＋';
  }));

  const modal = $('#confirmModal');
  $('#authorizeButton').addEventListener('click', () => modal.showModal());
  $('#modalClose').addEventListener('click', () => modal.close());
  $('#modalDone').addEventListener('click', () => modal.close());
  modal.addEventListener('click', event => { if (event.target === modal) modal.close(); });

  window.addEventListener('scroll', () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    $('#readingBar').style.width = `${max > 0 ? scrollY / max * 100 : 0}%`;
  }, {passive:true});

  if (!reducedMotion && matchMedia('(pointer:fine)').matches) {
    const phone = $('#heroPhone');
    window.addEventListener('mousemove', event => {
      const x = (event.clientX / innerWidth - .5) * 9;
      const y = (event.clientY / innerHeight - .5) * -7;
      $('.phone', phone).style.transform = `rotateY(${x - 7}deg) rotateX(${y + 3}deg) rotateZ(1.6deg)`;
    }, {passive:true});
  }
})();
