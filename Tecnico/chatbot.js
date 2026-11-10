/* TrackI – asistente de búsqueda documental de la Biblioteca.
   Solo busca en los documentos ya cargados por index.html (DOCS, CATS, S, rerender…) y responde con el enlace al archivo.
   No usa servidores ni IA externa; no guarda la conversación. */
(() => {
  const ICON = {
    chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    bot: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    send: '<path d="M3.714 3.048a.498.498 0 0 0-.683.627l2.843 7.627a2 2 0 0 1 0 1.396l-2.842 7.627a.498.498 0 0 0 .682.627l18-8.5a.5.5 0 0 0 0-.904z"/><path d="M6 12h16"/>',
    out: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>'
  };
  const ic = k => `<svg class="tb-icon" viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fold = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const SUGERENCIAS = ['Procedimiento de almacén', 'Reportes de O&M', 'Lista maestra de registros', 'Reglamento interno', 'Documentos de QHS', 'Plan de manejo de residuos'];
  const MAX_RESULTADOS = 5;
  const STOP = new Set(('a al algo con como cual cuales cuando de del dame donde el ella ellos en es esta estan este esto hay la las lo los me mi muestrame muestra ' +
    'necesito para por que quiero se si son su sus te tengo tienes tiene un una unos unas ver y o u busco buscar busca encontrar encuentro encuentra ' +
    'documento documentos archivo archivos informacion sobre acerca favor puedes puedo podrias quisiera quiero').split(' '));

  const root = document.createElement('div');
  root.className = 'tb-root';
  root.innerHTML = `
    <button type="button" class="tb-launcher" aria-label="Abrir el asistente TrackI" aria-expanded="false">${ic('chat')}</button>
    <section class="tb-panel" role="dialog" aria-label="Asistente virtual TrackI" hidden>
      <header class="tb-header">
        <span class="tb-avatar">${ic('bot')}</span>
        <div class="tb-title"><p class="tb-name">TrackI <span class="tb-beta">Beta</span></p><p class="tb-sub">Asistente de búsqueda documental</p></div>
        <button type="button" class="tb-close" aria-label="Cerrar el asistente">${ic('close')}</button>
      </header>
      <div class="tb-messages" role="log" aria-live="polite"></div>
      <form class="tb-form" autocomplete="off">
        <input class="tb-input" type="text" maxlength="200" placeholder="¿Qué documento buscas?…" aria-label="Escribe tu búsqueda">
        <button type="submit" class="tb-send" aria-label="Enviar">${ic('send')}</button>
      </form>
      <p class="tb-note">Búsqueda en la biblioteca · No guardamos tu conversación</p>
    </section>`;
  document.body.appendChild(root);

  const $ = s => root.querySelector(s);
  const launcher = $('.tb-launcher'), panel = $('.tb-panel'), log = $('.tb-messages'), form = $('.tb-form'), input = $('.tb-input');
  let started = false, busy = false;

  /* ---------- Apertura / cierre ---------- */
  function abrir(o) {
    root.classList.toggle('is-open', o);
    panel.hidden = !o;
    launcher.setAttribute('aria-expanded', o);
    if (o) { if (!started) { started = true; saludo(); } input.focus(); }
  }
  launcher.addEventListener('click', () => abrir(true));
  $('.tb-close').addEventListener('click', () => abrir(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && root.classList.contains('is-open')) abrir(false); });

  /* ---------- Mensajes ---------- */
  const bajar = () => { log.scrollTop = log.scrollHeight; };
  function add(html, cls) {
    const d = document.createElement('div');
    d.className = cls;
    d.innerHTML = html;
    log.appendChild(d); bajar();
    return d;
  }
  const bot = html => add(html, 'tb-msg tb-msg--bot');
  const yo = txt => add(esc(txt), 'tb-msg tb-msg--user');
  const chips = lista => add(lista.map(t => `<button type="button" class="tb-chip">${esc(t)}</button>`).join(''), 'tb-chips');
  const typing = () => add('<span></span><span></span><span></span>', 'tb-msg tb-msg--bot tb-typing');

  log.addEventListener('click', e => {
    const c = e.target.closest('.tb-chip');
    if (c) return preguntar(c.textContent);
    const v = e.target.closest('[data-ver]');
    if (v) return verEnBiblioteca(v.dataset.ver);
  });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const t = input.value.trim();
    if (t) { input.value = ''; preguntar(t); }
  });

  function saludo() {
    bot('¡Hola! Soy TrackI, el asistente de búsqueda de la Biblioteca Documental Técnica. Dime qué documento buscas y te comparto el enlace. Elige una opción o escribe la tuya.');
    chips(SUGERENCIAS);
  }

  /* ---------- Búsqueda ---------- */
  function tokens(q) {
    return fold(q).replace(/[^a-z0-9&\-.\s]/g, ' ').split(/\s+/)
      .map(t => t.replace(/^[.\-]+|[.\-]+$/g, '')).filter(t => t && !STOP.has(t))
      .map(t => t.length > 5 ? t.replace(/(es|s)$/, '') : t);
  }
  function pajar(d) {
    return d._tb || (d._tb = { all: fold(d.path || [d.category, d.area, d.fname].join('/')), tit: fold(d.title + ' ' + d.code) });
  }
  function buscar(q) {
    const tk = tokens(q);
    if (!tk.length) return null;
    const puntuar = d => {
      const h = pajar(d); let hits = 0, score = 0;
      for (const t of tk) if (h.all.includes(t)) { hits++; score += h.tit.includes(t) ? 3 : 1; }
      return { d, hits, score };
    };
    const todos = DOCS.map(puntuar).filter(r => r.hits);
    let lista = todos.filter(r => r.hits === tk.length), parcial = false;
    if (!lista.length && tk.length > 1) { lista = todos.filter(r => r.hits >= Math.ceil(tk.length / 2)); parcial = true; }
    lista.sort((a, b) => b.score - a.score || b.hits - a.hits || b.d.date - a.d.date);
    // Un mismo documento en .docx y .pdf cuenta una sola vez (se prefiere el PDF)
    const vistos = new Map();
    for (const r of lista) {
      const clave = (r.d.path || r.d.fname).replace(/\.[^./]+$/, '');
      const previo = vistos.get(clave);
      if (!previo || (r.d.ext === 'pdf' && previo.d.ext !== 'pdf')) vistos.set(clave, r);
    }
    return { tk, parcial, docs: [...vistos.values()].map(r => r.d) };
  }

  const docCard = d => {
    const url = d.webUrl && d.webUrl !== '#' ? d.webUrl : d.downloadUrl;
    const meta = [label(d.category), d.area, fmt(d.date)].filter(Boolean).join(' · ');
    return `<a class="tb-doc" href="${esc(url)}" target="_blank" rel="noopener">
      <span class="tb-doc-ext">${esc((d.ext || 'arch').toUpperCase().slice(0, 4))}</span>
      <span class="tb-doc-body"><span class="tb-doc-title">${esc((d.code ? d.code + ' – ' : '') + d.title)}</span><span class="tb-doc-meta">${esc(meta)}</span></span>
      <span class="tb-doc-open" aria-hidden="true">${ic('out')}</span></a>`;
  };

  function verEnBiblioteca(q) {
    S.q = q; S.catSel = ''; S.tab = 'all'; S.ext = ''; S.dias = 0;
    document.querySelector('#extSel').value = '';
    document.querySelector('#dateSel').value = '';
    document.querySelector('#q').value = q;
    document.querySelector('#catSel').value = '';
    rerender();
    if (matchMedia('(max-width:480px)').matches) abrir(false);
    document.querySelector('.panel').scrollIntoView({ behavior: 'smooth' });
  }

  function sugerir(excluir) {
    const q = fold(excluir || '');
    return SUGERENCIAS.filter(s => fold(s) !== q).sort(() => Math.random() - .5).slice(0, 3);
  }
  const otraCosa = excluir => { bot('¿Te ayudo con algo más?'); chips(sugerir(excluir)); };

  /* ---------- Respuestas ---------- */
  function responder(texto) {
    const t = fold(texto).trim();
    if (/^(hola|buen[oa]s|hey|saludos|que tal)\b/.test(t) && t.split(/\s+/).length <= 3) { bot('¡Hola! ¿Qué documento buscas?'); return chips(SUGERENCIAS); }
    if (/\bgracias\b/.test(t)) { bot('¡Con gusto! ¿Buscas algún otro documento?'); return chips(sugerir()); }
    if (/(ayuda|que puedes|quien eres|que haces|como funciona)/.test(t)) {
      bot('Busco documentos en la biblioteca: escribe un tema, una clave (por ejemplo <b>VE-0-P-03</b>) o el nombre de una carpeta y te muestro los más relevantes con su enlace.');
      return chips(SUGERENCIAS);
    }
    if (!DOCS.length) { return bot('La biblioteca todavía se está cargando. Inténtalo de nuevo en unos segundos.'); }

    const r = buscar(texto);
    if (!r || !r.docs.length) {
      bot(`No encontré documentos que coincidan con «${esc(texto)}». Prueba con otras palabras, con una clave o explora por categoría:`);
      return chips(CATS.map(label));
    }
    const n = r.docs.length;
    const entre = esc(texto);
    bot(r.parcial
      ? `No encontré coincidencias exactas para «${entre}», pero estos documentos coinciden con parte de tu búsqueda:`
      : `Encontré <b>${n}</b> documento${n === 1 ? '' : 's'} sobre «${entre}»${n > MAX_RESULTADOS ? '. Estos son los más relevantes:' : ':'}`);
    add(r.docs.slice(0, MAX_RESULTADOS).map(docCard).join(''), 'tb-docs');
    const q = r.tk.join(' ');
    add(`<button type="button" class="tb-action tb-action--primary" data-ver="${esc(q)}">${ic('list')}${n > MAX_RESULTADOS ? `Ver los ${n} resultados en la biblioteca` : 'Ver en la biblioteca'}</button>`, 'tb-actions');
    otraCosa(texto);
  }

  function preguntar(texto) {
    if (busy) return;
    busy = true;
    yo(texto);
    const t = typing();
    setTimeout(() => {
      t.remove();
      try { responder(texto); } finally { busy = false; bajar(); }
    }, 450);
  }
})();
