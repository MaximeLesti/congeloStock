/* Congélo — gestion de stock du congélateur, 100 % local (localStorage). */
(() => {
  'use strict';

  // ------------------------------------------------------------------
  // Constantes
  // ------------------------------------------------------------------
  const STORE_KEY = 'congelo.v1';
  const QR_PREFIX = 'CGL:';
  const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans 0/O/1/I

  const CATEGORIES = [
    { id: 'viande',   label: 'Viande',     emoji: '🥩', months: 6 },
    { id: 'volaille', label: 'Volaille',   emoji: '🍗', months: 6 },
    { id: 'poisson',  label: 'Poisson',    emoji: '🐟', months: 3 },
    { id: 'plat',     label: 'Plat cuisiné', emoji: '🍲', months: 3 },
    { id: 'legumes',  label: 'Légumes',    emoji: '🥦', months: 10 },
    { id: 'fruits',   label: 'Fruits',     emoji: '🍓', months: 10 },
    { id: 'pain',     label: 'Pain / pâtisserie', emoji: '🥖', months: 3 },
    { id: 'dessert',  label: 'Glace / dessert', emoji: '🍨', months: 2 },
    { id: 'autre',    label: 'Autre',      emoji: '🧊', months: 3 },
  ];
  const CAT = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

  const THERMAL_HINT = 'Mini imprimante thermique (Photo Creator / TinyPrint, Phomemo…) : l\'app crée une image. ' +
    'Appuie sur « Envoyer », puis choisis l\'app de ton imprimante (ex. TinyPrint) ou « Enregistrer l\'image » et imprime-la depuis cette app. ' +
    '⚠️ Ne choisis pas « Imprimer » dans le menu iPhone : ça passe par AirPrint en A4.';
  const FORMATS = [
    { id: 'th-roll', name: 'Thermique · rouleau 57/58 mm', thermal: true, roll: true, w: 48, h: 26, hint: THERMAL_HINT },
    { id: 'th-50x30', name: 'Thermique · étiquettes 50×30 mm', thermal: true, w: 50, h: 30, hint: THERMAL_HINT },
    { id: 'th-40x30', name: 'Thermique · étiquettes 40×30 mm', thermal: true, w: 40, h: 30, hint: THERMAL_HINT },
    { id: 'th-40x15', name: 'Thermique · ruban 12–15 mm (Niimbot, D30…)', thermal: true, w: 40, h: 14, hint: THERMAL_HINT },
    { id: 'a4-70x37', name: 'Planche A4 · 3×8 (70×37 mm)', sheet: true, page: [210, 297], cols: 3, rows: 8, w: 70, h: 37, gx: 0, gy: 0,
      hint: 'Planches autocollantes A4 « 24 étiquettes 70×37 » (Avery 3474, Herma 4453…). Imprime à 100 %, sans mise à l\'échelle.' },
    { id: 'a4-63x38', name: 'Planche A4 · 3×7 (63,5×38,1 mm)', sheet: true, page: [210, 297], cols: 3, rows: 7, w: 63.5, h: 38.1, gx: 2.5, gy: 0,
      hint: 'Planches A4 « 21 étiquettes » (Avery L7160 / J8160). Imprime à 100 %.' },
    { id: 'a4-plain', name: 'Feuille A4 normale (à découper + scotch)', sheet: true, page: [210, 297], cols: 3, rows: 8, w: 70, h: 37, gx: 0, gy: 0, cut: true,
      hint: 'Papier normal : découpe les étiquettes et scotche-les. Astuce : recouvre de scotch large pour résister au givre.' },
    { id: 'roll-62x29', name: 'Rouleau 62×29 mm (Brother DK-11209)', sheet: false, w: 62, h: 29,
      hint: 'Une étiquette par page. Depuis l\'iPhone, choisis l\'imprimante d\'étiquettes AirPrint ou enregistre en PDF.' },
    { id: 'roll-50x30', name: 'Rouleau 50×30 mm', sheet: false, w: 50, h: 30,
      hint: 'Une étiquette par page, format 50×30 mm.' },
  ];

  // ------------------------------------------------------------------
  // Stockage
  // ------------------------------------------------------------------
  const defaultState = () => ({
    version: 1,
    items: [],          // { id, batch, name, cat, qty, note, frozenAt, months, expiresAt, createdAt, removedAt }
    queue: [],          // ids d'étiquettes à imprimer
    settings: { format: 'th-roll', express: false, durations: {}, thermalSplit: false },
  });

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaultState();
      const s = JSON.parse(raw);
      const d = defaultState();
      const st = { ...d, ...s, settings: { ...d.settings, ...(s.settings || {}) } };
      // Migration : l'ancienne version mettait le format A4 par défaut → passer en thermique
      if (!st.settings.v2) {
        if (st.settings.format === 'a4-70x37') st.settings.format = 'th-roll';
        st.settings.v2 = true;
      }
      return st;
    } catch (e) {
      console.warn('Lecture impossible', e);
      return defaultState();
    }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { toast('⚠️ Impossible d\'enregistrer (stockage plein ?)'); }
  }
  // Demande à iOS de ne pas purger les données
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  const byId = id => state.items.find(i => i.id === id);
  const inStock = () => state.items.filter(i => !i.removedAt);

  function newCode() {
    const rnd = new Uint32Array(6);
    for (;;) {
      crypto.getRandomValues(rnd);
      const code = Array.from(rnd, n => CODE_ALPHABET[n % CODE_ALPHABET.length]).join('');
      if (!byId(code)) return code;
    }
  }
  const monthsFor = cat => +(state.settings.durations[cat] || CAT[cat]?.months || 6);
  const defaultMonths = () => +(state.settings.defaultMonths || 3);
  // libellé de catégorie seulement pour les anciens produits qui en ont une
  const catLabel = it => (it.cat && it.cat !== 'autre' ? CAT[it.cat]?.label : '') || '';

  // ------------------------------------------------------------------
  // Dates
  // ------------------------------------------------------------------
  const pad = n => String(n).padStart(2, '0');
  const isoDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => isoDay(new Date());
  const parseDay = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  function addMonths(iso, n) {
    const d = parseDay(iso); const day = d.getDate();
    d.setDate(1); d.setMonth(d.getMonth() + n);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    return isoDay(d);
  }
  const daysUntil = iso => Math.round((parseDay(iso) - parseDay(today())) / 86400000);
  const fmt = iso => parseDay(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const fmtLong = iso => parseDay(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const fmtStamp = ts => new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' ' +
    new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  function dueInfo(iso) {
    const d = daysUntil(iso);
    if (d < 0) return { cls: 'bad', text: `dépassé ${-d} j`, long: `Date dépassée depuis ${-d} jour(s)` };
    if (d === 0) return { cls: 'bad', text: 'aujourd\'hui', long: 'À consommer aujourd\'hui' };
    if (d <= 30) return { cls: 'warn', text: `${d} j`, long: `À consommer d'ici ${d} jour(s)` };
    const m = Math.round(d / 30.4);
    return { cls: '', text: m >= 1 ? `${m} mois` : `${d} j`, long: `Encore ~${m} mois` };
  }

  // ------------------------------------------------------------------
  // Utilitaires UI
  // ------------------------------------------------------------------
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let toastTimer;
  function toast(msg, action) {
    const t = $('#toast');
    t.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button>${esc(action.label)}</button>` : '');
    t.hidden = false;
    if (action) t.querySelector('button').onclick = () => { t.hidden = true; action.fn(); };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, action ? 6000 : 2800);
  }

  let sheetOnClose = null;
  function openSheet(html, onClose) {
    $('#sheet').innerHTML = html;
    $('#sheet-backdrop').hidden = false;
    sheetOnClose = onClose || null;
    return $('#sheet');
  }
  function closeSheet() {
    $('#sheet-backdrop').hidden = true;
    const cb = sheetOnClose; sheetOnClose = null;
    if (cb) cb();
  }
  $('#sheet-backdrop').addEventListener('click', e => { if (e.target.id === 'sheet-backdrop') closeSheet(); });

  function beep() {
    try {
      const ctx = beep.ctx || (beep.ctx = new (window.AudioContext || window.webkitAudioContext)());
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = 1150; g.gain.value = 0.12;
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.09);
    } catch (e) { /* silencieux */ }
    if (navigator.vibrate) navigator.vibrate(60);
  }

  // ------------------------------------------------------------------
  // Navigation
  // ------------------------------------------------------------------
  const TITLES = { stock: 'Stock', add: 'Ajouter', scan: 'Scanner', labels: 'Étiquettes', more: 'Plus' };
  let current = 'stock';

  function go(tab) {
    if (tab === current) { if (tab === 'scan') startScan(); return; }
    if (current === 'scan') stopScan();
    current = tab;
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + tab));
    $$('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    $('#title').textContent = TITLES[tab];
    window.scrollTo(0, 0);
    render();
    if (tab === 'scan') startScan();
    if (tab === 'add') prepareAddForm();
  }
  $$('.tabbar button').forEach(b => b.addEventListener('click', () => go(b.dataset.tab)));
  document.addEventListener('click', e => {
    const g = e.target.closest('[data-go]');
    if (g) go(g.dataset.go);
  });

  // ------------------------------------------------------------------
  // Rendu général
  // ------------------------------------------------------------------
  function render() {
    const n = inStock().length;
    $('#topbar-extra').textContent = current === 'stock' ? `${n} produit${n > 1 ? 's' : ''}` : '';
    const q = state.queue.length;
    $('#queue-badge').hidden = q === 0;
    $('#queue-badge').textContent = q;
    if (current === 'stock') renderStock();
    if (current === 'labels') renderLabels();
    if (current === 'more') renderMore();
  }

  // ---------------- Stock ----------------
  let filterCat = 'all';
  let search = '';
  $('#search').addEventListener('input', e => { search = e.target.value; renderStock(); });

  function groups(items) {
    // un "lot" = étiquettes créées ensemble (même produit, même date)
    const map = new Map();
    for (const it of items) {
      const k = it.batch || it.id;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(it);
    }
    return Array.from(map.values()).map(units => ({ key: units[0].batch || units[0].id, units, first: units[0] }))
      .sort((a, b) => a.first.expiresAt.localeCompare(b.first.expiresAt) || a.first.name.localeCompare(b.first.name));
  }

  function renderStock() {
    const all = inStock();
    const expired = all.filter(i => daysUntil(i.expiresAt) < 0).length;
    const soon = all.filter(i => { const d = daysUntil(i.expiresAt); return d >= 0 && d <= 30; }).length;
    $('#summary').innerHTML = `
      <div class="stat"><b>${all.length}</b><span>en stock</span></div>
      <div class="stat warn"><b>${soon}</b><span>&lt; 30 jours</span></div>
      <div class="stat bad"><b>${expired}</b><span>dépassés</span></div>`;

    const counts = {};
    all.forEach(i => { counts[i.cat] = (counts[i.cat] || 0) + 1; });
    const chips = [{ id: 'all', label: 'Tout', emoji: '' }, ...CATEGORIES.filter(c => counts[c.id])];
    if (filterCat !== 'all' && !counts[filterCat]) filterCat = 'all';
    $('#cat-chips').innerHTML = chips.map(c =>
      `<button class="chip ${filterCat === c.id ? 'active' : ''}" data-cat="${c.id}">${c.emoji} ${esc(c.label)}${c.id !== 'all' ? ' · ' + counts[c.id] : ''}</button>`).join('');
    $('#cat-chips').hidden = chips.length <= 2;

    const s = search.trim().toLowerCase();
    const items = all.filter(i => (filterCat === 'all' || i.cat === filterCat) &&
      (!s || i.name.toLowerCase().includes(s) || (i.note || '').toLowerCase().includes(s) || i.id.toLowerCase() === s));
    const gs = groups(items);
    $('#stock-list').innerHTML = gs.map(g => {
      const it = g.first; const due = dueInfo(it.expiresAt);
      const sub = [it.qty, 'congelé le ' + fmt(it.frozenAt)].filter(Boolean).join(' · ');
      return `<li class="item" data-batch="${esc(g.key)}">
        <div class="emoji">${CAT[it.cat]?.emoji || '📦'}</div>
        <div class="main"><div class="name">${esc(it.name)}</div><div class="sub">${esc(sub)}</div></div>
        ${g.units.length > 1 ? `<span class="count">×${g.units.length}</span>` : ''}
        <span class="due ${due.cls}">${due.text}</span>
      </li>`;
    }).join('');
    $('#stock-empty').hidden = all.length !== 0;
  }
  $('#cat-chips').addEventListener('click', e => {
    const c = e.target.closest('.chip'); if (!c) return;
    filterCat = c.dataset.cat; renderStock();
  });
  $('#stock-list').addEventListener('click', e => {
    const li = e.target.closest('.item'); if (!li) return;
    showBatch(li.dataset.batch);
  });

  function showBatch(batchKey) {
    const units = inStock().filter(i => (i.batch || i.id) === batchKey);
    if (!units.length) return closeSheet();
    const it = units[0]; const due = dueInfo(it.expiresAt);
    const sh = openSheet(`
      <div class="big-emoji">${CAT[it.cat]?.emoji || '📦'}</div>
      <h3>${esc(it.name)}</h3>
      <div class="hint">${esc([catLabel(it), it.qty].filter(Boolean).join(' · '))}</div>
      <div class="status ${due.cls || 'ok'}">${due.long}</div>
      <dl>
        <dt>Congelé le</dt><dd>${fmtLong(it.frozenAt)}</dd>
        <dt>À consommer avant</dt><dd>${fmtLong(it.expiresAt)}</dd>
        ${it.note ? `<dt>Note</dt><dd>${esc(it.note)}</dd>` : ''}
        <dt>En stock</dt><dd>${units.length} portion${units.length > 1 ? 's' : ''}</dd>
      </dl>
      <ul class="units">${units.map(u => `
        <li data-id="${u.id}"><code>${u.id}</code><span class="grow"></span>
          <button class="btn" data-act="reprint">🏷️</button>
          <button class="btn" data-act="out">Sortir</button>
          <button class="btn danger" data-act="del" title="Supprimer (erreur)">✕</button></li>`).join('')}
      </ul>
      <div class="actions">
        <button class="btn" data-act="again">➕ Recongeler le même produit</button>
        <button class="btn" data-act="close">Fermer</button>
      </div>`);
    sh.onclick = e => {
      const b = e.target.closest('button[data-act]'); if (!b) return;
      const id = b.closest('li')?.dataset.id;
      switch (b.dataset.act) {
        case 'out': removeItem(id, true); showBatch(batchKey); break;
        case 'reprint': enqueue([id]); toast('Étiquette ajoutée à l\'impression', { label: 'Voir', fn: () => { closeSheet(); go('labels'); } }); break;
        case 'del':
          if (confirm(`Supprimer définitivement ${id} (sans le compter comme sorti) ?`)) {
            state.items = state.items.filter(i => i.id !== id);
            state.queue = state.queue.filter(q => q !== id);
            save(); render(); showBatch(batchKey);
          }
          break;
        case 'again': closeSheet(); go('add'); fillAddFrom(it); break;
        case 'close': closeSheet(); break;
      }
    };
  }

  // ---------------- Retrait / remise ----------------
  function removeItem(id, withUndo) {
    const it = byId(id); if (!it || it.removedAt) return;
    it.removedAt = Date.now();
    save(); render();
    if (withUndo) toast(`${it.name} sorti du congélo`, { label: 'Annuler', fn: () => restoreItem(id) });
  }
  function restoreItem(id) {
    const it = byId(id); if (!it) return;
    it.removedAt = null; save(); render();
    toast(`${it.name} remis en stock`);
  }

  // ---------------- Ajout ----------------
  const form = $('#add-form');
  let monthsTouched = false;

  // (plus de choix de catégorie : tout est enregistré en « autre », la durée se règle directement)
  function setMonths(m) {
    if (!monthsTouched) form.months.value = m || defaultMonths();
    updateHint();
  }
  form.months.addEventListener('input', () => { monthsTouched = true; updateHint(); });
  form.frozenAt.addEventListener('input', updateHint);
  form.count.addEventListener('input', updateHint);
  form.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => {
    form.count.value = Math.max(1, Math.min(50, (+form.count.value || 1) + +b.dataset.step)); updateHint();
  }));
  form.name.addEventListener('change', () => {
    // si le nom correspond à un produit déjà connu, on reprend sa durée et sa quantité
    const prev = [...state.items].reverse().find(i => i.name.toLowerCase() === form.name.value.trim().toLowerCase());
    if (prev) { setMonths(prev.months); if (prev.qty && !form.qty.value) form.qty.value = prev.qty; }
  });

  function updateHint() {
    const m = +form.months.value || 0; const f = form.frozenAt.value;
    const n = +form.count.value || 1;
    $('#add-hint').textContent = f && m
      ? `${n} étiquette${n > 1 ? 's' : ''} · à consommer avant le ${fmtLong(addMonths(f, m))}` : '';
    form.querySelector('[type=submit]').textContent = n > 1 ? `Créer ${n} étiquettes` : 'Créer l\'étiquette';
  }

  function prepareAddForm() {
    if (!form.frozenAt.value) form.frozenAt.value = today();
    form.cat.value = 'autre';
    setMonths();
    const names = [...new Set(state.items.map(i => i.name))].sort((a, b) => a.localeCompare(b));
    $('#names-list').innerHTML = names.map(n => `<option value="${esc(n)}">`).join('');
  }
  function fillAddFrom(it) {
    form.reset(); monthsTouched = false;
    form.name.value = it.name; form.qty.value = it.qty || ''; form.note.value = it.note || '';
    form.frozenAt.value = today(); form.count.value = 1;
    form.cat.value = 'autre';
    setMonths(it.months);
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    const name = form.name.value.trim();
    if (!name) return form.name.focus();
    const count = Math.max(1, Math.min(50, +form.count.value || 1));
    const frozenAt = form.frozenAt.value || today();
    const months = Math.max(1, +form.months.value || monthsFor(form.cat.value));
    const batch = 'B' + Date.now().toString(36);
    const ids = [];
    for (let k = 0; k < count; k++) {
      const id = newCode();
      state.items.push({
        id, batch, name, cat: form.cat.value, qty: form.qty.value.trim(), note: form.note.value.trim(),
        frozenAt, months, expiresAt: addMonths(frozenAt, months), createdAt: Date.now(), removedAt: null,
      });
      ids.push(id);
    }
    enqueue(ids);
    save();
    form.reset(); monthsTouched = false; form.count.value = 1;
    form.frozenAt.value = today(); form.cat.value = 'autre';
    toast(`${count} étiquette${count > 1 ? 's' : ''} créée${count > 1 ? 's' : ''} — ${name}`);
    go('labels');
  });

  // ---------------- Étiquettes / impression ----------------
  function enqueue(ids) {
    for (const id of ids) if (!state.queue.includes(id)) state.queue.push(id);
    save(); render();
  }

  const fmtSel = $('#label-format');
  fmtSel.innerHTML = FORMATS.map(f => `<option value="${f.id}">${esc(f.name)}</option>`).join('');
  fmtSel.value = state.settings.format;
  fmtSel.addEventListener('change', () => { state.settings.format = fmtSel.value; save(); renderLabels(); });
  $('#label-skip').addEventListener('input', renderLabels);
  const currentFormat = () => FORMATS.find(f => f.id === state.settings.format) || FORMATS[0];

  function qrSvg(text, sizeMm) {
    const qr = qrcode(0, 'M');
    qr.addData(text); qr.make();
    const n = qr.getModuleCount(); const q = 2; // zone de silence
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-q} ${-q} ${n + 2 * q} ${n + 2 * q}" width="${sizeMm}mm" height="${sizeMm}mm" shape-rendering="crispEdges"><rect x="${-q}" y="${-q}" width="${n + 2 * q}" height="${n + 2 * q}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }

  function labelHtml(it, f) {
    const pad = 1.8;
    const qrMm = Math.min(f.h - 2 * pad, f.w * 0.46);
    const base = f.h; // tailles de police proportionnelles à la hauteur
    const nameSize = Math.min(base * 0.115, 4.6);
    const metaSize = Math.min(base * 0.075, 2.9);
    return `<div class="lbl" style="width:${f.w}mm;height:${f.h}mm;${f.cut ? 'outline:0.2mm dashed #999;outline-offset:-0.1mm;' : ''}">
      ${qrSvg(QR_PREFIX + it.id, qrMm.toFixed(2))}
      <div class="txt">
        <div class="l-name" style="font-size:${nameSize.toFixed(2)}mm">${esc(it.name)}</div>
        <div class="l-meta" style="font-size:${metaSize.toFixed(2)}mm">${esc(it.qty || catLabel(it))}</div>
        <div class="l-meta" style="font-size:${metaSize.toFixed(2)}mm">Congelé ${fmt(it.frozenAt)}</div>
        <div class="l-meta l-due" style="font-size:${metaSize.toFixed(2)}mm">Avant ${fmt(it.expiresAt)}</div>
        <div class="l-code" style="font-size:${(metaSize * 0.9).toFixed(2)}mm">${it.id}</div>
      </div>
    </div>`;
  }

  // ---- Rendu image pour imprimante thermique (8 points/mm = 203 dpi) ----
  const DPMM = 8;
  const FONT = '-apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif';
  const MONO = 'ui-monospace, Menlo, "Courier New", monospace';

  function fitText(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let s = text;
    while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s.trimEnd() + '…';
  }
  function wrap2(ctx, text, maxW) {
    const words = text.split(/\s+/); let line = '';
    for (let i = 0; i < words.length; i++) {
      const t = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(t).width > maxW && line) {
        return [line, fitText(ctx, words.slice(i).join(' '), maxW)];
      }
      line = t;
    }
    return [fitText(ctx, line, maxW)];
  }

  function thermalCanvas(it, f) {
    const W = Math.round(f.w * DPMM), H = Math.round(f.h * DPMM);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    const pad = Math.round(1.2 * DPMM);
    const compact = f.h < 20;

    // QR code en pixels entiers (net à l'impression)
    const qr = qrcode(0, 'M'); qr.addData(QR_PREFIX + it.id); qr.make();
    const n = qr.getModuleCount();
    const maxSide = Math.min(H - 2 * pad, W * (compact ? 0.3 : 0.38));
    const mod = Math.max(2, Math.floor(maxSide / n));
    const side = mod * n;
    const qx = pad, qy = Math.round((H - side) / 2);
    g.fillStyle = '#000';
    for (let r = 0; r < n; r++) for (let col = 0; col < n; col++)
      if (qr.isDark(r, col)) g.fillRect(qx + col * mod, qy + r * mod, mod, mod);

    // Texte
    const x0 = qx + side + Math.round(1.6 * DPMM), tw = W - x0 - pad;
    g.textBaseline = 'top';
    // une ligne = texte + graisse + famille + taille ; les dates rétrécissent au lieu d'être coupées
    const line = (text, weight, family, size, shrink) => {
      let s = size;
      g.font = `${weight} ${s}px ${family}`;
      if (shrink) while (s > 10 && g.measureText(text).width > tw) { s--; g.font = `${weight} ${s}px ${family}`; }
      return { text: fitText(g, text, tw), font: g.font, size: s };
    };
    const lines = [];
    if (compact) {
      const ns = Math.round(H * 0.24), ms = Math.round(H * 0.19);
      lines.push(line(it.name, 800, FONT, ns, false));
      lines.push(line(`Avant ${fmt(it.expiresAt)}`, 800, FONT, ms, true));
      lines.push(line(`${it.id} · cgl ${fmt(it.frozenAt)}`, 600, MONO, Math.round(ms * 0.8), true));
    } else {
      const ns = Math.min(34, Math.round(H * 0.15)), ms = Math.min(23, Math.round(H * 0.10));
      g.font = `800 ${ns}px ${FONT}`;
      wrap2(g, it.name, tw).forEach(l => lines.push({ text: l, font: g.font, size: ns }));
      const sub = it.qty || catLabel(it);
      if (sub) lines.push(line(sub, 500, FONT, ms, false));
      lines.push(line(`Congelé ${fmt(it.frozenAt)}`, 500, FONT, ms, true));
      lines.push(line(`AVANT ${fmt(it.expiresAt)}`, 800, FONT, Math.round(ms * 1.15), true));
      lines.push(line(it.id, 700, MONO, Math.round(ms * 0.9), true));
    }
    const gap = Math.round(H * (compact ? 0.05 : 0.025));
    const total = lines.reduce((s, l) => s + l.size, 0) + gap * (lines.length - 1);
    let y = Math.max(pad * 0.6, Math.round((H - total) / 2));
    for (const l of lines) { g.font = l.font; g.fillText(l.text, x0, y); y += l.size + gap; }
    // Noir & blanc pur (les imprimantes thermiques n'aiment pas le gris)
    const img = g.getImageData(0, 0, W, H), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) < 150 ? 0 : 255;
      d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  // Bande continue : toutes les étiquettes l'une sous l'autre avec des pointillés de découpe
  function thermalStrip(items, f) {
    const cs = items.map(it => thermalCanvas(it, f));
    const W = cs[0].width, sep = Math.round(4 * DPMM);
    const H = cs.reduce((s, c) => s + c.height, 0) + sep * (cs.length - 1) + sep;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    let y = 0;
    cs.forEach((ci, k) => {
      g.drawImage(ci, 0, y); y += ci.height;
      if (k < cs.length - 1) {
        g.fillStyle = '#000';
        for (let x = 0; x < W; x += 16) g.fillRect(x, y + sep / 2 - 1, 8, 2); // ✂︎ ligne de découpe
      }
      y += sep;
    });
    return c;
  }

  function dataUrlToFile(url, name) {
    const bin = atob(url.split(',')[1]); const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new File([u8], name, { type: 'image/png' });
  }

  function thermalFiles() {
    const f = currentFormat();
    const items = state.queue.map(byId).filter(Boolean);
    if (!items.length) return [];
    const stamp = today();
    if (f.roll && !state.settings.thermalSplit) {
      return [dataUrlToFile(thermalStrip(items, f).toDataURL('image/png'), `etiquettes-congelo-${stamp}.png`)];
    }
    return items.map(it => dataUrlToFile(thermalCanvas(it, f).toDataURL('image/png'), `etiquette-${it.id}.png`));
  }

  function renderLabels() {
    const f = currentFormat();
    state.queue = state.queue.filter(id => byId(id));
    const items = state.queue.map(byId);
    $('#queue-count').textContent = items.length;
    $('#format-hint').textContent = f.hint;
    $('#skip-wrap').hidden = !f.sheet || f.cut;
    $('#split-wrap').hidden = !(f.thermal && f.roll);
    $('#label-skip').max = f.sheet ? f.cols * f.rows : 1;
    $('#print-btn').textContent = f.thermal ? '📤 Envoyer à l\'imprimante' : '🖨️ Imprimer';
    $('#label-preview').innerHTML = items.map(it =>
      `<div class="lbl-wrap" data-id="${it.id}">${f.thermal
        ? `<img class="lbl lbl-img" alt="" src="${thermalCanvas(it, f).toDataURL('image/png')}" style="width:${f.w}mm;height:${f.h}mm">`
        : labelHtml(it, f)}<button class="rm" aria-label="Retirer">×</button></div>`).join('');
    $('#labels-empty').hidden = items.length > 0;
    $('#print-btn').disabled = !items.length;
    $('#print-btn').parentElement.hidden = !items.length;
    $('#queue-clear').hidden = !items.length;
  }
  $('#label-preview').addEventListener('click', e => {
    const b = e.target.closest('.rm'); if (!b) return;
    const id = b.closest('.lbl-wrap').dataset.id;
    state.queue = state.queue.filter(q => q !== id); save(); render();
  });
  $('#queue-clear').addEventListener('click', () => {
    if (confirm('Vider la file d\'impression ? (les produits restent en stock)')) { state.queue = []; save(); render(); }
  });

  function buildPrint() {
    const f = currentFormat();
    const items = state.queue.map(byId).filter(Boolean);
    const area = $('#print-area');
    if (!f.sheet) {
      $('#page-style').textContent = `@page { size: ${f.w}mm ${f.h}mm; margin: 0; }`;
      area.innerHTML = items.map(it => `<div class="page" style="width:${f.w}mm;height:${f.h}mm">${labelHtml(it, f)}</div>`).join('');
      return;
    }
    const [pw, ph] = f.page;
    const per = f.cols * f.rows;
    const skip = f.cut ? 0 : Math.max(0, Math.min(per - 1, (+$('#label-skip').value || 1) - 1));
    const mx = (pw - f.cols * f.w - (f.cols - 1) * f.gx) / 2;
    const my = (ph - f.rows * f.h - (f.rows - 1) * f.gy) / 2;
    $('#page-style').textContent = `@page { size: ${pw}mm ${ph}mm; margin: 0; }`;
    const cells = [...Array(skip).fill(null), ...items];
    let html = '';
    for (let p = 0; p < cells.length; p += per) {
      const chunk = cells.slice(p, p + per);
      html += `<div class="page" style="width:${pw}mm;height:${ph - 0.5}mm">
        <div class="grid" style="position:absolute;left:${mx}mm;top:${my}mm;grid-template-columns:repeat(${f.cols},${f.w}mm);grid-auto-rows:${f.h}mm;column-gap:${f.gx}mm;row-gap:${f.gy}mm">
        ${chunk.map(it => it ? labelHtml(it, f) : '<div></div>').join('')}
        </div></div>`;
    }
    area.innerHTML = html;
  }

  $('#thermal-split').checked = !!state.settings.thermalSplit;
  $('#thermal-split').addEventListener('change', e => { state.settings.thermalSplit = e.target.checked; save(); });

  async function sendThermal() {
    const files = thermalFiles(); // synchrone : garde le « geste utilisateur » exigé par iOS
    if (navigator.canShare && navigator.canShare({ files })) {
      try { await navigator.share({ files }); }
      catch (e) { if (e.name === 'AbortError') return false; throw e; }
      return true;
    }
    // ordinateur / navigateur sans partage : téléchargement
    files.forEach((file, k) => setTimeout(() => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file); a.download = file.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    }, k * 250));
    return true;
  }

  $('#print-btn').addEventListener('click', async () => {
    if (!state.queue.length) return;
    const printed = state.queue.length;
    const f = currentFormat();
    if (f.thermal) {
      let ok = false;
      try { ok = await sendThermal(); } catch (e) { toast('Partage impossible — appuie longuement sur une étiquette pour l\'enregistrer'); }
      if (ok) askClearQueue(printed);
      return;
    }
    buildPrint();
    setTimeout(() => {
      window.print();
      // après la fenêtre d'impression : proposer de vider la file
      setTimeout(() => askClearQueue(printed), 400);
    }, 50);
  });

  function askClearQueue(printed) {
        const sh = openSheet(`
          <h3>Impression terminée ?</h3>
          <p class="hint">Si les ${printed} étiquette(s) sont bien sorties, on vide la file. Sinon garde-les pour réessayer.</p>
          <div class="actions">
            <button class="btn primary big" data-a="done">✅ Oui, vider la file</button>
            <button class="btn" data-a="keep">Garder pour réimprimer</button>
          </div>`);
        sh.onclick = e => {
          const b = e.target.closest('[data-a]'); if (!b) return;
          if (b.dataset.a === 'done') { state.queue = []; $('#label-skip').value = 1; save(); render(); }
          closeSheet();
        };
  }

  // ---------------- Scanner ----------------
  const video = $('#video');
  const canvas = $('#scan-canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let stream = null, raf = 0, paused = false, lastCode = '', lastAt = 0;

  $('#express').checked = !!state.settings.express;
  $('#express').addEventListener('change', e => { state.settings.express = e.target.checked; save(); });

  async function startScan() {
    paused = false;
    if (stream) { loop(); return; }
    $('#scan-msg').textContent = 'Vise l\'étiquette avec la caméra';
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      $('#scan-msg').textContent = 'Caméra indisponible ici (il faut une adresse https). Utilise « Photo » ou le code.';
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } },
      });
      if (current !== 'scan') { stopScan(); return; }
      video.srcObject = stream;
      await video.play();
      $('#cam-start').hidden = true;
      loop();
    } catch (err) {
      console.warn(err);
      stream = null;
      $('#scan-msg').textContent = 'Accès caméra refusé ou impossible. Réessaie, ou utilise « Photo ».';
      $('#cam-start').hidden = false;
    }
  }
  function stopScan() {
    cancelAnimationFrame(raf); raf = 0;
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    video.srcObject = null;
  }
  $('#cam-start').addEventListener('click', startScan);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopScan(); else if (current === 'scan') startScan();
  });

  function loop() {
    cancelAnimationFrame(raf);
    const tick = () => {
      if (!stream || paused) return;
      if (video.readyState >= 2 && video.videoWidth) {
        const scale = Math.min(1, 640 / video.videoWidth);
        const w = Math.round(video.videoWidth * scale), h = Math.round(video.videoHeight * scale);
        if (canvas.width !== w) { canvas.width = w; canvas.height = h; }
        ctx.drawImage(video, 0, 0, w, h);
        const res = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
        if (res && res.data) { onCode(res.data); if (paused) return; }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  function parseCode(raw) {
    const s = String(raw).trim().toUpperCase();
    const m = s.match(/^CGL:([A-Z0-9]{6})$/) || s.match(/^([A-Z0-9]{6})$/);
    return m ? m[1] : null;
  }

  function onCode(raw) {
    const id = parseCode(raw);
    const now = Date.now();
    if (raw === lastCode && now - lastAt < 2500) return; // évite les doublons
    lastCode = raw; lastAt = now;
    if (!id) { $('#scan-msg').textContent = 'QR code non reconnu (pas une étiquette Congélo)'; return; }
    beep();
    const sc = $('.scanner'); sc.classList.add('hit'); setTimeout(() => sc.classList.remove('hit'), 600);
    handleId(id);
  }

  function handleId(id) {
    const it = byId(id);
    paused = true;
    const resume = () => { lastAt = Date.now(); if (current === 'scan') { paused = false; loop(); } };

    if (!it) {
      openSheet(`<div class="big-emoji">❓</div><h3>Étiquette inconnue</h3>
        <p class="hint">Le code <b>${esc(id)}</b> n'existe pas dans ce téléphone (créé sur un autre appareil, ou supprimé).</p>
        <div class="actions"><button class="btn primary big" data-a="ok">OK</button></div>`, resume)
        .onclick = e => { if (e.target.closest('[data-a]')) closeSheet(); };
      return;
    }
    if (it.removedAt) {
      openSheet(`<div class="big-emoji">${CAT[it.cat]?.emoji || '📦'}</div><h3>${esc(it.name)}</h3>
        <div class="status warn">Déjà sorti le ${fmtStamp(it.removedAt)}</div>
        <div class="actions">
          <button class="btn" data-a="restore">↩︎ Remettre en stock</button>
          <button class="btn primary big" data-a="ok">OK</button>
        </div>`, resume)
        .onclick = e => {
          const b = e.target.closest('[data-a]'); if (!b) return;
          if (b.dataset.a === 'restore') restoreItem(id);
          closeSheet();
        };
      return;
    }
    if (state.settings.express) {
      removeItem(id, true);
      $('#scan-msg').textContent = `✅ ${it.name} sorti`;
      setTimeout(resume, 900);
      return;
    }
    const due = dueInfo(it.expiresAt);
    const left = inStock().filter(i => (i.batch || i.id) === (it.batch || it.id)).length;
    openSheet(`<div class="big-emoji">${CAT[it.cat]?.emoji || '📦'}</div>
      <h3>${esc(it.name)}</h3>
      <div class="hint">${esc([it.qty || catLabel(it), 'code ' + it.id].filter(Boolean).join(' · '))}</div>
      <div class="status ${due.cls || 'ok'}">${due.long}</div>
      <dl>
        <dt>Congelé le</dt><dd>${fmtLong(it.frozenAt)}</dd>
        <dt>Avant le</dt><dd>${fmtLong(it.expiresAt)}</dd>
        ${it.note ? `<dt>Note</dt><dd>${esc(it.note)}</dd>` : ''}
        ${left > 1 ? `<dt>Restera</dt><dd>${left - 1} portion(s) de ce lot</dd>` : ''}
      </dl>
      <div class="actions">
        <button class="btn primary big" data-a="out">Sortir du congélo</button>
        <button class="btn" data-a="cancel">Annuler</button>
      </div>`, resume)
      .onclick = e => {
        const b = e.target.closest('[data-a]'); if (!b) return;
        if (b.dataset.a === 'out') removeItem(id, true);
        closeSheet();
      };
  }

  // Photo (secours si la caméra en direct n'est pas dispo)
  $('#photo-input').addEventListener('change', async e => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    try {
      const img = await new Promise((res, rej) => {
        const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = URL.createObjectURL(file);
      });
      let found = null;
      for (const max of [1000, 1600, 700]) {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * s), h = Math.round(img.height * s);
        canvas.width = w; canvas.height = h; ctx.drawImage(img, 0, 0, w, h);
        found = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'attemptBoth' });
        if (found) break;
      }
      URL.revokeObjectURL(img.src);
      if (found) { lastCode = ''; onCode(found.data); }
      else toast('Aucun QR code trouvé sur la photo — rapproche-toi');
    } catch (err) { toast('Photo illisible'); }
  });

  $('#code-form').addEventListener('submit', e => {
    e.preventDefault();
    const id = parseCode($('#code-input').value);
    if (!id) return toast('Le code fait 6 caractères (ex. K7F2QX)');
    $('#code-input').value = ''; $('#code-input').blur();
    handleId(id);
  });

  // ---------------- Plus : historique, sauvegarde, réglages ----------------
  function renderMore() {
    const out = state.items.filter(i => i.removedAt).sort((a, b) => b.removedAt - a.removedAt).slice(0, 40);
    $('#history-list').innerHTML = out.map(it => `
      <li class="item" data-id="${it.id}">
        <div class="emoji">${CAT[it.cat]?.emoji || '📦'}</div>
        <div class="main"><div class="name">${esc(it.name)}</div><div class="sub">sorti le ${fmtStamp(it.removedAt)} · ${it.id}</div></div>
        <button class="btn" data-act="restore">↩︎</button>
      </li>`).join('');
    $('#history-empty').hidden = out.length > 0;

    $('#durations').innerHTML = `
      <div class="dur-row"><span>Durée proposée pour un nouveau produit</span>
      <input type="number" inputmode="numeric" min="1" max="36" id="default-months" value="${defaultMonths()}"> mois</div>`;

    const total = state.items.length;
    $('#storage-info').textContent = `${total} étiquette(s) enregistrée(s) au total, dont ${inStock().length} en stock.`;
  }
  $('#history-list').addEventListener('click', e => {
    const b = e.target.closest('[data-act=restore]'); if (!b) return;
    e.stopPropagation();
    restoreItem(b.closest('li').dataset.id);
  });
  $('#durations').addEventListener('change', e => {
    const inp = e.target.closest('#default-months'); if (!inp) return;
    state.settings.defaultMonths = Math.max(1, Math.min(36, +inp.value || 3)); save();
  });

  $('#export-btn').addEventListener('click', async () => {
    const data = JSON.stringify({ app: 'congelo', exportedAt: new Date().toISOString(), ...state }, null, 1);
    const name = `congelo-${today()}.json`;
    const file = new File([data], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Sauvegarde Congélo' }); return; }
      catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  $('#import-input').addEventListener('change', async e => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.items)) throw new Error('format');
      const replace = confirm(`Sauvegarde du ${data.exportedAt ? new Date(data.exportedAt).toLocaleDateString('fr-FR') : '?'} : ${data.items.length} étiquette(s).\n\nOK = remplacer les données actuelles\nAnnuler = fusionner`);
      if (replace) {
        state = { ...defaultState(), ...data, settings: { ...defaultState().settings, ...(data.settings || {}) } };
        delete state.app; delete state.exportedAt;
      } else {
        const known = new Set(state.items.map(i => i.id));
        data.items.forEach(i => { if (!known.has(i.id)) state.items.push(i); });
      }
      save(); render(); toast('Import terminé');
    } catch (err) { toast('Fichier de sauvegarde invalide'); }
  });

  $('#wipe-btn').addEventListener('click', () => {
    if (confirm('Effacer TOUT le stock, l\'historique et les étiquettes ? (exporte une sauvegarde avant)') &&
        confirm('Vraiment sûr ?')) {
      state = defaultState(); save(); render(); toast('Tout est effacé');
    }
  });

  // ------------------------------------------------------------------
  // Démarrage
  // ------------------------------------------------------------------
  // Raccourcis d'URL : index.html#scan, #add… (utile pour un raccourci iOS)
  const startTab = (location.hash || '').replace('#', '');
  render();
  if (TITLES[startTab] && startTab !== 'stock') go(startTab);

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    // Quand une nouvelle version de l'app est installée, on recharge une fois pour l'afficher tout de suite
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController && !reloaded) { reloaded = true; location.reload(); }
    });
    navigator.serviceWorker.register('sw.js').then(reg => reg.update()).catch(() => {});
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) navigator.serviceWorker.getRegistration().then(r => r && r.update()).catch(() => {});
    });
  }

  // exposé pour le débogage / tests
  window.congelo = { get state() { return state; }, handleId, parseCode };
})();
