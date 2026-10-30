/* Sterk & Smaakvol – kookboek-app (offline PWA) */
'use strict';

// ------------------------------------------------------------------ opslag
const opslag = {
  get(k, d) { try { const v = localStorage.getItem('kb-' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('kb-' + k, JSON.stringify(v)); } catch (e) { /* vol of geblokkeerd */ } }
};
const CFG = window.KOOKBOEK_CONFIG || {};
const S = {
  data: { categorieen: [], recepten: [] },
  fav: new Set(opslag.get('fav', [])),
  lijst: opslag.get('lijst', []),            // [{id, factor, variant}]
  extra: opslag.get('extraItems', []),       // [{tekst}]
  afgevinkt: new Set(opslag.get('afgevinkt', [])),
  voorraad: new Set(opslag.get('voorraad', ['zout', 'zwarte peper', 'water'])),
  instellingen: Object.assign({ dataUrl: '', sheetUrl: '', sleutel: '', thema: '' }, opslag.get('instellingen', {})),
  wachtrij: opslag.get('wachtrij', []),      // recepten die nog naar Google moeten
  filter: { q: '', cat: '', snel: [], sort: 'boek' },
  porties: {}, variant: {}, aangevinkt: {},
  laatsteSync: opslag.get('laatsteSync', null),
  syncBezig: false
};
const dataUrl = () => S.instellingen.dataUrl || CFG.dataUrl || '';
const sheetUrl = () => S.instellingen.sheetUrl || CFG.sheetUrl || '';
const bewaarLijst = () => { opslag.set('lijst', S.lijst); opslag.set('extraItems', S.extra); opslag.set('afgevinkt', [...S.afgevinkt]); opslag.set('voorraad', [...S.voorraad]); badge(); };

// ------------------------------------------------------------------ hulpjes
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const regels = s => String(s ?? '').split('\n').map(x => x.trim()).filter(Boolean);
const lijstVan = (s, sep) => String(s ?? '').split(sep).map(x => x.trim()).filter(Boolean);
const getal = n => (n == null || n === '' || isNaN(n)) ? null : Number(n);
function fmt(n) {
  if (n == null) return '';
  let r = n >= 20 ? Math.round(n) : n >= 2 ? Math.round(n * 2) / 2 : Math.round(n * 100) / 100;
  return String(r).replace('.', ',');
}
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2600); }
const ICON = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
  cart: '<svg viewBox="0 0 24 24"><path d="M3 4h2l2.4 11h11L21 7H6.2"/><circle cx="9" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M12 4v11M7 9l5-5 5 5M5 14v5h14v-5"/></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  sync: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4"/></svg>'
};

// ------------------------------------------------------------------ ingrediënten
const EENHEDEN = 'kg|g|ml|cl|dl|l|el|tl|st|stuks?|snufjes?|teentjes?|tenen|blaadjes?|takjes?|plakjes?|blikken|blik|zakjes?|bosjes?|scheutjes?|handjes?|handvol';
const ING_RE = new RegExp('^(\\d+(?:[.,]\\d+)?|½|¼|¾)(?:\\s*(?:-|–|tot)\\s*(\\d+(?:[.,]\\d+)?))?\\s*(' + EENHEDEN + ')?(?=\\s|$)\\s*(.*)$', 'i');
const FRAC = { '½': .5, '¼': .25, '¾': .75 };
function parseRegel(raw) {
  const m = raw.match(ING_RE);
  if (!m) return { raw, q: null, q2: null, unit: '', naam: raw };
  const q = FRAC[m[1]] ?? parseFloat(m[1].replace(',', '.'));
  const q2 = m[2] ? parseFloat(m[2].replace(',', '.')) : null;
  return { raw, q, q2, unit: (m[3] || '').toLowerCase(), naam: m[4] || '' };
}
function parseIngredienten(tekst) {
  const groepen = []; let g = { titel: '', variant: false, items: [] };
  for (const l of regels(tekst)) {
    const h = l.match(/^#{1,4}\s*(.+)$/);
    if (h) {
      if (g.items.length || g.titel) groepen.push(g);
      const v = h[1].match(/^variant\s*:\s*(.+)$/i);
      g = { titel: v ? v[1].trim() : h[1].trim(), variant: !!v, items: [] };
    } else g.items.push(parseRegel(l.replace(/^[-•*]\s*/, '')));
  }
  if (g.items.length || g.titel) groepen.push(g);
  return groepen;
}
function hoeveelheid(it, f) {
  if (it.q == null) return '';
  const a = fmt(it.q * f), b = it.q2 != null ? '–' + fmt(it.q2 * f) : '';
  return a + b + (it.unit ? ' ' + it.unit : '');
}
function sleutelNaam(naam) {
  return norm(naam).replace(/\(.*?\)/g, '').split(/,| voor | om | of /)[0]
    .replace(/\b(rauwe?|verse?|gekookte|ongekookte|fijngesneden|fijn gesneden|gehakte?|mager|magere|halfvolle)\b/g, '')
    .replace(/\s+/g, ' ').trim();
}
const AFDELINGEN = [
  ['Groenten & fruit', /(appel|peer|banaan|bes|bessen|aardbei|framboos|citroen|limoen|sinaas|mango|ananas|tomaat|tomaten|komkommer|paprika|ui\b|uien|sjalot|knoflook|gember|spinazie|sla\b|rucola|broccoli|bloemkool|courgette|wortel|aardappel|krieltjes|zoete aardappel|champignon|prei|selder|avocado|kool|koolsla|boontjes|sperzie|erwten|mais|maïs|lente-?ui|bieslook|peterselie|koriander|dille|basilicum|munt|rozemarijn vers|jalape|chili(?!vlok|poed|saus)|groente|kers|druif|pompoen|aubergine|venkel|radijs|biet)/],
  ['Vlees, vis & kip', /(kip|kalkoen|rund|gehakt|varken|spek|bacon|ham|worst|steak|biefstuk|lam|zalm|kibbeling|kibling|tonijn|vis|garnaal|garnalen|kabeljauw|pangasius|schelvis|filet|stoofvlees|buik|gebraad|chorizo|salami|pulled)/],
  ['Zuivel & eieren', /(yoghurt|skyr|kwark|melk|room|kaas|cheddar|mozzarella|feta|parmezaan|ricotta|mascarpone|cottage|boter|ei\b|eieren|eiwit(?!poeder)|creme fraiche|crème)/],
  ['Brood, granen & pasta', /(wrap|tortilla|brood|pita|bun|broodje|havermout|havervlokken|haver|rijst|pasta|spaghetti|penne|orzo|noedel|quinoa|couscous|bulgur|bloem|meel|maïzena|maizena|cornflakes|crackers|granola|muesli|panko|paneermeel)/],
  ['Conserven, sauzen & olie', /(olie|azijn|sojasaus|saus|ketchup|mayonaise|mosterd|passata|tomatenpuree|blik|bouillon|kikkererwt|bonen|linzen|kokosmelk|pesto|honing|siroop|stroop|pindakaas|tahin|sriracha|teriyaki|worcester|augurk|olijven|kappertjes|zongedroogde)/],
  ['Kruiden & bakproducten', /(poeder|peper|zout|kruid|kaneel|paprikapoeder|komijn|oregano|tijm|rozemarijn|laurier|nootmuskaat|kurkuma|cayenne|chilivlok|vanille|bakpoeder|soda|zoetstof|suiker|cacao|chocolade|chia|lijnzaad|sesam|noten|amandel|walnoot|cashew|pinda|rozijn|gist|gelatine|speculaas)/],
  ['Diepvries', /(diepvries|bevroren|ijs\b)/]
];
function afdeling(naam) {
  const n = norm(naam);
  if (/eiwitpoeder|proteinepoeder|whey/.test(n)) return 'Kruiden & bakproducten';
  for (const [a, re] of AFDELINGEN) if (re.test(n)) return a;
  return 'Overig';
}

// ------------------------------------------------------------------ markdown
function inline(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'); }
function md(tekst) {
  const ls = String(tekst ?? '').replace(/\r/g, '').split('\n');
  let html = '', i = 0, lijst = null;
  const sluitLijst = () => { if (lijst) { html += `</${lijst}>`; lijst = null; } };
  while (i < ls.length) {
    const l = ls[i].trim();
    if (!l) { sluitLijst(); i++; continue; }
    if (l.startsWith('|')) {
      sluitLijst();
      const rows = [];
      while (i < ls.length && ls[i].trim().startsWith('|')) { rows.push(ls[i].trim()); i++; }
      const cells = r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const isSep = r => /^\|?\s*:?-{2,}/.test(r);
      let head = null, body = rows;
      if (rows.length > 1 && isSep(rows[1])) { head = cells(rows[0]); body = rows.slice(2); }
      html += '<div class="tablewrap"><table>' + (head ? '<thead><tr>' + head.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead>' : '') +
        '<tbody>' + body.filter(r => !isSep(r)).map(r => '<tr>' + cells(r).map(c => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>';
      continue;
    }
    let m;
    if ((m = l.match(/^#{1,6}\s+(.*)$/))) { sluitLijst(); html += `<h4>${inline(m[1])}</h4>`; }
    else if ((m = l.match(/^[-•*]\s+(.*)$/))) { if (lijst !== 'ul') { sluitLijst(); html += '<ul>'; lijst = 'ul'; } html += `<li>${inline(m[1])}</li>`; }
    else if ((m = l.match(/^\d+[.)]\s+(.*)$/))) { if (lijst !== 'ol') { sluitLijst(); html += '<ol>'; lijst = 'ol'; } html += `<li>${inline(m[1])}</li>`; }
    else { sluitLijst(); html += `<p>${inline(l)}</p>`; }
    i++;
  }
  sluitLijst();
  return html;
}

// ------------------------------------------------------------------ data laden & sync
async function cacheLees() {
  try { const c = await caches.open('kookboek-data'); const r = await c.match('data.json'); if (r) return await r.json(); } catch (e) { }
  return opslag.get('data', null);
}
async function cacheSchrijf(d) {
  try { const c = await caches.open('kookboek-data'); await c.put('data.json', new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json' } })); return; } catch (e) { }
  opslag.set('data', d);
}
function zetData(d) {
  const r = (d.recepten || []).filter(x => x && x.naam).map(x => Object.assign({}, x, { id: x.id || norm(x.naam).replace(/[^a-z0-9]+/g, '-') }));
  r.forEach(x => { x._zoek = norm([x.naam, x.categorie, x.subcategorie, x.tags, x.beschrijving, x.ingredienten].join(' ')); });
  S.data = { categorieen: d.categorieen || [], recepten: r, bijgewerkt: d.bijgewerkt };
}
async function laad() {
  const c = await cacheLees();
  if (c && c.recepten && c.recepten.length) zetData(c);
  else {
    try { const r = await fetch('data/recepten.json'); zetData(await r.json()); } catch (e) { toast('Kon de recepten niet laden'); }
  }
  render();
  if (dataUrl()) sync(false);
}
async function sync(melding = true) {
  if (!dataUrl()) { if (melding) toast('Nog geen Google-koppeling ingesteld (zie Meer)'); return; }
  if (S.syncBezig) return;
  S.syncBezig = true; renderStatus();
  try {
    await verstuurWachtrij();
    const r = await fetch(dataUrl() + (dataUrl().includes('?') ? '&' : '?') + 't=' + Date.now(), { redirect: 'follow' });
    const d = await r.json();
    if (!d || !Array.isArray(d.recepten)) throw new Error('Onverwacht antwoord');
    if (!d.recepten.length && S.data.recepten.length) throw new Error('Google Sheet is leeg; lokale data behouden');
    const voor = S.data.recepten.length;
    // recepten die nog in de wachtrij staan lokaal behouden
    S.wachtrij.forEach(w => { if (!d.recepten.find(x => x.id === w.recept.id || x.naam === w.recept.naam)) d.recepten.push(w.recept); });
    if (!d.categorieen || !d.categorieen.length) d.categorieen = S.data.categorieen;
    zetData(d); await cacheSchrijf(d);
    S.laatsteSync = new Date().toISOString(); opslag.set('laatsteSync', S.laatsteSync);
    const nu = S.data.recepten.length;
    if (melding || nu !== voor) toast(nu > voor ? `${nu - voor} nieuwe recepten binnengehaald` : 'Recepten zijn up-to-date');
    render();
  } catch (e) {
    if (melding) toast(navigator.onLine ? 'Synchroniseren mislukt: ' + e.message : 'Offline – je ziet de bewaarde versie');
  } finally { S.syncBezig = false; renderStatus(); }
}
async function verstuurWachtrij() {
  if (!S.wachtrij.length || !dataUrl()) return;
  const rest = [];
  for (const w of S.wachtrij) {
    try {
      const r = await fetch(dataUrl(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ sleutel: S.instellingen.sleutel }, w)) });
      const d = await r.json();
      if (!d.ok) { toast('Opslaan in Google mislukt: ' + (d.fout || '')); rest.push(w); }
    } catch (e) { rest.push(w); }
  }
  S.wachtrij = rest; opslag.set('wachtrij', rest);
}

// ------------------------------------------------------------------ routing
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [a, ...b] = h.split('/');
  return { naam: a || 'recepten', arg: decodeURIComponent(b.join('/')) };
}
window.addEventListener('hashchange', () => render(true));
function render(nav) {
  const r = route();
  const wide = matchMedia('(min-width: 900px)').matches;
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active',
    a.dataset.nav === (r.naam === 'r' ? (S.vorigeLijst || 'recepten') : r.naam === 'bewerk' || r.naam === 'nieuw' ? 'instellingen' : r.naam)));
  document.body.classList.remove('show-detail', 'wide-single');
  badge();
  if (r.naam === 'recepten' || r.naam === 'favorieten') {
    S.vorigeLijst = r.naam;
    renderLijst(r.naam === 'favorieten');
    if (wide) $('#detailPane').innerHTML = S.laatsteDetail && vind(S.laatsteDetail) ? detailHTML(vind(S.laatsteDetail)) : `<div class="placeholder"><div>${ICON.list}<p>Kies een recept</p></div></div>`;
    if (wide && S.laatsteDetail) bindDetail(vind(S.laatsteDetail));
  } else if (r.naam === 'r') {
    const rec = vind(r.arg);
    if (wide && !$('#listPane .list')) renderLijst(S.vorigeLijst === 'favorieten');
    document.body.classList.add('show-detail');
    S.laatsteDetail = r.arg;
    $('#detailPane').innerHTML = rec ? detailHTML(rec) : '<div class="empty">Recept niet gevonden.</div>';
    if (rec) bindDetail(rec);
    markeerActief();
    if (nav) $('#detailPane').scrollTop = 0, window.scrollTo(0, 0);
  } else {
    if (wide) document.body.classList.add('wide-single');
    const el = $('#listPane');
    if (r.naam === 'boodschappen') renderBoodschappen(el);
    else if (r.naam === 'info') renderInfo(el, r.arg);
    else if (r.naam === 'instellingen') renderInstellingen(el);
    else if (r.naam === 'nieuw' || r.naam === 'bewerk') renderFormulier(el, r.arg);
    if (nav) window.scrollTo(0, 0), el.scrollTop = 0;
  }
}
const vind = id => S.data.recepten.find(x => x.id === id);
function badge() {
  const b = $('#lijstBadge'); if (!b) return;
  b.textContent = S.lijst.length; b.hidden = !S.lijst.length;
}
function markeerActief() { document.querySelectorAll('.card').forEach(c => c.classList.toggle('active', c.dataset.id === S.laatsteDetail)); }

// ------------------------------------------------------------------ receptenlijst
const SNEL = [
  ['fav', 'Favorieten', r => S.fav.has(r.id)],
  ['snel', '≤ 20 min', r => getal(r.totaal_min) != null && r.totaal_min <= 20],
  ['eiwit', '30 g+ eiwit', r => getal(r.eiwit) >= 30 && (r.voedingswaarden_basis || 'per portie').includes('portie')],
  ['mealprep', 'Mealprep', r => /mealprep/i.test(r.tags + r.categorie)],
  ['vriezer', 'Vriezer', r => /vriez|vriezer/i.test(r.tags)],
  ['airfryer', 'Airfryer', r => /airfryer/i.test(r.tags + r.naam)],
  ['kip', 'Kip', r => /\bkip/i.test(r.tags + ' ' + r.naam)],
  ['veg', 'Vegetarisch', r => /vegetarisch|vegan/i.test(r.tags)]
];
function gefilterd(alleenFav) {
  const f = S.filter, q = norm(f.q).split(/\s+/).filter(Boolean);
  let lijst = S.data.recepten.filter(r => r.soort !== 'info' || q.length);
  if (alleenFav) lijst = lijst.filter(r => S.fav.has(r.id));
  if (f.cat) lijst = lijst.filter(r => r.categorie === f.cat);
  for (const s of f.snel) { const def = SNEL.find(x => x[0] === s); if (def) lijst = lijst.filter(def[2]); }
  if (q.length) lijst = lijst.filter(r => q.every(w => r._zoek.includes(w)));
  const by = {
    boek: (a, b) => (a.volgorde || 0) - (b.volgorde || 0),
    naam: (a, b) => a.naam.localeCompare(b.naam, 'nl'),
    tijd: (a, b) => (getal(a.totaal_min) ?? 9999) - (getal(b.totaal_min) ?? 9999),
    eiwit: (a, b) => (getal(b.eiwit) ?? -1) - (getal(a.eiwit) ?? -1),
    kcal: (a, b) => (getal(a.kcal) ?? 9999) - (getal(b.kcal) ?? 9999),
    nieuw: (a, b) => String(b.toegevoegd || '').localeCompare(String(a.toegevoegd || '')) || (b.volgorde || 0) - (a.volgorde || 0)
  }[f.sort];
  return lijst.sort(by);
}
function categorieen() {
  const volg = S.data.categorieen.map(c => c.categorie);
  const extra = [...new Set(S.data.recepten.map(r => r.categorie))].filter(c => !volg.includes(c));
  return [...volg, ...extra].filter(c => S.data.recepten.some(r => r.categorie === c && r.soort !== 'info'));
}
function initialen(n) { return n.split(/[\s-]+/).filter(w => /^[A-Za-zÀ-ÿ]/.test(w)).slice(0, 2).map(w => w[0].toUpperCase()).join(''); }
function kaart(r) {
  const meta = [];
  if (r.totaal_min) meta.push(`${r.totaal_min} min`);
  if (getal(r.kcal) != null) meta.push(`${fmt(r.kcal)} kcal`);
  if (getal(r.eiwit) != null) meta.push(`${fmt(r.eiwit)} g eiwit`);
  if (!meta.length && r.portiegewicht) meta.push(esc(r.portiegewicht));
  return `<a class="card" data-id="${esc(r.id)}" href="#/r/${encodeURIComponent(r.id)}">
    <div class="ic ${r.soort === 'info' ? 'info' : ''}">${esc(initialen(r.naam))}</div>
    <div><h3>${esc(r.naam)}</h3><div class="meta">${meta.map(m => `<span>${m}</span>`).join('')}</div></div>
    ${S.fav.has(r.id) ? `<span class="fav">${ICON.heart.replace('fill="none"', '')}</span>` : ''}</a>`;
}
function renderLijst(alleenFav) {
  const el = $('#listPane');
  const f = S.filter;
  const cats = categorieen();
  const gaatGroeperen = f.sort === 'boek' && !f.cat && !f.q;
  const res = gefilterd(alleenFav);
  let lijstHtml = '';
  if (!res.length) lijstHtml = `<div class="empty">${alleenFav && !S.fav.size ? 'Nog geen favorieten. Tik op het hartje bij een recept.' : 'Niets gevonden.'}</div>`;
  else if (gaatGroeperen) {
    for (const c of cats) { const g = res.filter(r => r.categorie === c); if (g.length) lijstHtml += `<div class="group-title">${esc(c)}</div>` + g.map(kaart).join(''); }
    const rest = res.filter(r => !cats.includes(r.categorie)); if (rest.length) lijstHtml += `<div class="group-title">Overig</div>` + rest.map(kaart).join('');
  } else lijstHtml = res.map(kaart).join('');
  const bestaand = $('#zoek', el);
  const focus = bestaand && document.activeElement === bestaand;
  el.innerHTML = `<div class="topbar">
      <h1>${alleenFav ? 'Favorieten' : 'Recepten'}</h1>
      <label class="search">${ICON.search}<input id="zoek" type="search" placeholder="Zoek recept, ingrediënt of tag" value="${esc(f.q)}" autocomplete="off"></label>
      <div class="chips" id="catChips"><button class="chip ${!f.cat ? 'on' : ''}" data-cat="">Alles</button>${cats.map(c => `<button class="chip ${f.cat === c ? 'on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <div class="chips" id="snelChips">${SNEL.filter(s => !(alleenFav && s[0] === 'fav')).map(s => `<button class="chip warm ${f.snel.includes(s[0]) ? 'on' : ''}" data-snel="${s[0]}">${s[1]}</button>`).join('')}</div>
      <div class="row-between"><span class="count">${res.length} ${res.length === 1 ? 'recept' : 'recepten'}</span>
        <select class="sort" id="sort" aria-label="Sorteren">
          ${[['boek', 'Volgorde boek'], ['naam', 'Naam A-Z'], ['tijd', 'Snelste eerst'], ['eiwit', 'Meeste eiwit'], ['kcal', 'Minste kcal'], ['nieuw', 'Laatst toegevoegd']].map(([v, t]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${t}</option>`).join('')}
        </select></div>
    </div>
    <div class="list">${lijstHtml}</div>`;
  const zoek = $('#zoek', el);
  if (focus) { zoek.focus(); zoek.setSelectionRange(zoek.value.length, zoek.value.length); }
  zoek.addEventListener('input', () => { f.q = zoek.value; clearTimeout(renderLijst.t); renderLijst.t = setTimeout(() => renderLijst(alleenFav), 120); });
  $('#catChips', el).addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (!b) return; f.cat = b.dataset.cat; renderLijst(alleenFav); });
  $('#snelChips', el).addEventListener('click', e => { const b = e.target.closest('[data-snel]'); if (!b) return; const k = b.dataset.snel; f.snel = f.snel.includes(k) ? f.snel.filter(x => x !== k) : [...f.snel, k]; renderLijst(alleenFav); });
  $('#sort', el).addEventListener('change', e => { f.sort = e.target.value; renderLijst(alleenFav); });
  markeerActief();
}

// ------------------------------------------------------------------ detail
function factor(r) {
  const basis = getal(r.porties);
  const p = S.porties[r.id];
  if (basis) return (p ?? basis) / basis;
  return p ?? 1;
}
function gekozenVariant(r, groepen) {
  const vs = groepen.filter(g => g.variant).map(g => g.titel);
  if (!vs.length) return null;
  return vs.includes(S.variant[r.id]) ? S.variant[r.id] : vs[0];
}
function zichtbareGroepen(r) {
  const groepen = parseIngredienten(r.ingredienten);
  const v = gekozenVariant(r, groepen);
  return { groepen: groepen.filter(g => !g.variant || g.titel === v), alle: groepen, variant: v };
}
// Porties wijzigen (gedeeld door receptweergave en kookmodus)
function wijzigPorties(r, d) {
  const basis = getal(r.porties);
  if (basis) { const p = (S.porties[r.id] ?? basis) + d; if (p >= 1) S.porties[r.id] = p; }
  else { const x = factor(r); const reeks = [0.25, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10]; const i = reeks.indexOf(x); S.porties[r.id] = reeks[Math.max(0, Math.min(reeks.length - 1, (i < 0 ? 2 : i) + d))]; }
}
function portieLabel(r) {
  const basis = getal(r.porties), f = factor(r);
  return basis ? `${fmt(basis * f)} ${basis * f === 1 ? 'portie' : 'porties'}` : `× ${fmt(f)}`;
}
// Bereidingsstappen met omgerekende hoeveelheden en per stap de ingrediënten die je erbij nodig hebt
function stappenHTML(r) {
  const f = factor(r);
  const items = zichtbareGroepen(r).groepen.flatMap(g => g.items);
  const stappen = regels(r.stappen);
  const nodig = window.Stappen ? Stappen.perStap(stappen, items) : stappen.map(() => []);
  return stappen.map((s, i) => {
    const delen = window.Stappen ? Stappen.schaalStap(s, f, items) : [s];
    const tekst = delen.map(d => typeof d === 'string' ? inline(d) : `<b class="amt">${esc(d.tekst)}</b>`).join('');
    const lijst = nodig[i].length ? `<div class="nodig"><span class="nodig-kop">Nodig in deze stap</span><ul>${nodig[i].map(({ item }) =>
      `<li><b>${esc(hoeveelheid(item, f))}</b> ${esc(item.naam)}</li>`).join('')}</ul></div>` : '';
    return { tekst, lijst, ruw: s };
  });
}
function detailHTML(r) {
  const f = factor(r);
  const { groepen, alle, variant } = zichtbareGroepen(r);
  const varianten = alle.filter(g => g.variant).map(g => g.titel);
  const basis = getal(r.porties);
  const stappen = regels(r.stappen);
  const fact = (t, v) => v ? `<div class="fact"><small>${t}</small><b>${esc(v)}</b></div>` : '';
  const min = v => getal(v) != null ? `${v} min` : '';
  const checked = S.aangevinkt[r.id] || {};
  const macro = (v, l, u = 'g') => getal(v) != null ? `<div class="macro"><b>${fmt(v)}${u === 'kcal' ? '' : ' ' + u}</b><small>${l}</small></div>` : '';
  const heeftMacros = ['kcal', 'eiwit', 'koolhydraten', 'vet'].some(k => getal(r[k]) != null);
  const op = S.lijst.some(x => x.id === r.id);
  let ingHtml = '';
  for (const g of groepen) {
    if (g.titel && !g.variant) ingHtml += `<div class="ing-group">${esc(g.titel)}</div>`;
    for (const it of g.items) {
      const k = norm(it.raw);
      ingHtml += `<label class="ing ${checked[k] ? 'done' : ''}"><input type="checkbox" data-ing="${esc(k)}" ${checked[k] ? 'checked' : ''}>
        <span>${it.q != null ? `<span class="q">${esc(hoeveelheid(it, f))}</span> ` : ''}${esc(it.q != null ? it.naam : it.raw)}</span></label>`;
    }
  }
  return `<div class="detail-head">
      <button class="iconbtn back" onclick="history.length>1?history.back():location.hash='#/'" aria-label="Terug">${ICON.back}</button>
      <span class="spacer"></span>
      <button class="iconbtn ${S.fav.has(r.id) ? 'on' : ''}" id="favBtn" aria-label="Favoriet">${ICON.heart}</button>
      <a class="iconbtn" href="#/bewerk/${encodeURIComponent(r.id)}" aria-label="Bewerken">${ICON.edit}</a>
    </div>
    <div class="pane-inner detail">
      <div class="kicker">${esc(r.categorie)}${r.subcategorie ? ' · ' + esc(r.subcategorie) : ''}</div>
      <h2>${esc(r.naam)}</h2>
      ${r.beschrijving ? `<p class="lead">${esc(r.beschrijving)}</p>` : ''}
      ${r.tags ? `<div class="tags">${lijstVan(r.tags, ',').map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
      <div class="facts">${fact('Moeilijkheid', r.moeilijkheid)}${fact('Voorbereiding', min(r.voorbereiding_min))}${fact('Bereiding', min(r.bereiding_min))}${fact('Totaal', min(r.totaal_min))}${fact('Porties', r.porties)}${fact(basis ? 'Portiegewicht' : 'Opbrengst', r.portiegewicht)}</div>
      ${r.tijd_tekst ? `<p class="note">⏱ ${esc(r.tijd_tekst)}</p>` : ''}
      ${r.soort !== 'info' && (stappen.length || groepen.length) ? `<div class="actions">
        ${stappen.length ? `<button class="btn primary" id="kookBtn">${ICON.play} Kookmodus</button>` : ''}
        ${groepen.length ? `<button class="btn ${op ? '' : 'warm'}" id="lijstBtn">${ICON.cart} ${op ? 'Bijwerken op lijst' : 'Op boodschappenlijst'}</button>` : ''}
      </div>` : ''}
      ${groepen.length ? `<div class="section"><h3>Ingrediënten
          <span class="stepper"><button data-p="-1" aria-label="Minder">−</button><span>${portieLabel(r)}</span><button data-p="1" aria-label="Meer">+</button></span></h3>
        ${varianten.length ? `<div class="variant">${varianten.map(v => `<button class="chip ${v === variant ? 'on' : ''}" data-variant="${esc(v)}">${esc(v)}</button>`).join('')}</div>` : ''}
        ${ingHtml}
        ${f !== 1 ? `<p class="note">Omgerekend van ${basis ? `${fmt(basis)} naar ${fmt(basis * f)} porties` : `het basisrecept naar × ${fmt(f)}`}. De bereidingsstappen hieronder gebruiken dezelfde hoeveelheden.</p>` : ''}
      </div>` : ''}
      ${r.keukengerei ? `<div class="section"><h3>Keukengerei</h3><p style="margin:0">${lijstVan(r.keukengerei, /;|•/).map(esc).join(' · ')}</p></div>` : ''}
      ${stappen.length ? `<div class="section"><h3>Bereiding</h3><ol class="steps">${stappenHTML(r).map(st => `<li><div>${st.tekst}</div>${st.lijst}</li>`).join('')}</ol></div>` : ''}
      ${heeftMacros ? `<div class="section"><h3>Voedingswaarden <small class="count">${esc(r.voedingswaarden_basis || 'per portie')}</small></h3>
        <div class="macros">${macro(r.kcal, 'kcal', 'kcal')}${macro(r.eiwit, 'eiwit')}${macro(r.koolhydraten, 'koolhydraten')}${macro(r.suikers, 'suikers')}${macro(r.vet, 'vet')}${macro(r.verzadigd_vet, 'verz. vet')}${macro(r.vezels, 'vezels')}${macro(r.zout, 'zout')}</div>
        <p class="note">Schattingen; controleer je eigen merken.</p></div>` : ''}
      ${r.extra ? `<div class="section md">${md(r.extra)}</div>` : ''}
      <div style="height:24px"></div>
    </div>`;
}
function bindDetail(r) {
  const el = $('#detailPane');
  const her = () => { const y = el.scrollTop, wy = window.scrollY; el.innerHTML = detailHTML(r); bindDetail(r); el.scrollTop = y; window.scrollTo(0, wy); };
  $('#favBtn', el).onclick = () => { S.fav.has(r.id) ? S.fav.delete(r.id) : S.fav.add(r.id); opslag.set('fav', [...S.fav]); her(); if (route().naam !== 'r' || matchMedia('(min-width: 900px)').matches) renderLijst(S.vorigeLijst === 'favorieten'); };
  el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { wijzigPorties(r, Number(b.dataset.p)); her(); });
  el.querySelectorAll('[data-variant]').forEach(b => b.onclick = () => { S.variant[r.id] = b.dataset.variant; her(); });
  el.querySelectorAll('[data-ing]').forEach(c => c.onchange = () => { (S.aangevinkt[r.id] ||= {})[c.dataset.ing] = c.checked; c.closest('.ing').classList.toggle('done', c.checked); });
  const lb = $('#lijstBtn', el);
  if (lb) lb.onclick = () => {
    const bestaand = S.lijst.find(x => x.id === r.id);
    const groepen = parseIngredienten(r.ingredienten);
    const item = { id: r.id, factor: factor(r), variant: gekozenVariant(r, groepen) };
    if (bestaand) Object.assign(bestaand, item); else S.lijst.push(item);
    bewaarLijst(); her();
    toast(bestaand ? 'Boodschappenlijst bijgewerkt' : 'Toegevoegd aan je boodschappenlijst');
  };
  const kb = $('#kookBtn', el);
  if (kb) kb.onclick = () => startKookmodus(r);
}

// ------------------------------------------------------------------ kookmodus
let wakeLock = null;
async function houdWakker() { try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !$('#cook').hidden) houdWakker(); });
function startKookmodus(r) {
  const stappen = regels(r.stappen); let i = 0, toonIng = false;
  const box = $('#cook'); box.hidden = false; houdWakker(); startKookmodus.bezig = true;
  const teken = () => {
    const f = factor(r), basis = getal(r.porties); const { groepen } = zichtbareGroepen(r);
    const ingLijst = groepen.map(g => (g.titel && !g.variant ? `<div class="ing-group">${esc(g.titel)}</div>` : '') + g.items.map(it => `<div class="ing"><span>${it.q != null ? `<span class="q">${esc(hoeveelheid(it, f))}</span> ${esc(it.naam)}` : esc(it.raw)}</span></div>`).join('')).join('');
    const st = stappenHTML(r)[i];
    const s = stappen[i];
    const timers = [...s.matchAll(/(\d+)(?:\s*(?:tot|-|–)\s*(\d+))?\s*(minuten|minuut|min\b|uur|seconden)/gi)].map(m => {
      const n = Number(m[2] || m[1]); const mult = /uur/i.test(m[3]) ? 3600 : /sec/i.test(m[3]) ? 1 : 60; return { label: m[0], sec: n * mult };
    }).filter((t, k, a) => t.sec >= 30 && t.sec <= 6 * 3600 && a.findIndex(x => x.label === t.label) === k);
    box.innerHTML = `<div class="cook-top"><button class="iconbtn" id="cookClose" aria-label="Sluiten">${ICON.close}</button>
        <div class="t">${esc(r.naam)}</div>
        <div class="cook-porties"><span class="stepper"><button data-cp="-1" aria-label="Minder porties">−</button><span>${portieLabel(r)}</span><button data-cp="1" aria-label="Meer porties">+</button></span>
          ${f !== 1 && basis ? `<small>basisrecept ${fmt(basis)} ${basis === 1 ? 'portie' : 'porties'}</small>` : ''}</div>
        <button class="btn small" id="cookIng" aria-pressed="${toonIng}">${ICON.list}<span>Ingrediënten</span></button></div>
      <div class="cook-progress"><div style="width:${(i + 1) / stappen.length * 100}%"></div></div>
      <div class="cook-body"><div class="cook-step-nr">Stap ${i + 1} van ${stappen.length}</div><div class="cook-text">${st.tekst}</div>${st.lijst}
        ${timers.length ? `<div class="cook-timers">${timers.map(t => `<button class="btn" data-sec="${t.sec}" data-label="${esc(t.label)}">⏱ Timer ${esc(t.label)}</button>`).join('')}</div>` : ''}</div>
      ${toonIng ? `<div class="cook-ings">${ingLijst}</div>` : ''}
      <div class="cook-nav"><button class="btn" id="cookPrev" ${i === 0 ? 'disabled' : ''}>Vorige</button>
        <button class="btn primary" id="cookNext">${i === stappen.length - 1 ? 'Klaar' : 'Volgende'}</button></div>`;
    $('#cookClose').onclick = sluit;
    $('#cookIng').onclick = () => { toonIng = !toonIng; teken(); };
    box.querySelectorAll('[data-cp]').forEach(b => b.onclick = () => { wijzigPorties(r, Number(b.dataset.cp)); teken(); });
    $('#cookPrev').onclick = () => { if (i > 0) { i--; teken(); } };
    $('#cookNext').onclick = () => { if (i < stappen.length - 1) { i++; teken(); } else sluit(); };
    box.querySelectorAll('[data-sec]').forEach(b => b.onclick = () => startTimer(Number(b.dataset.sec), `${r.naam.slice(0, 22)} – stap ${i + 1}`));
  };
  const sluit = () => { startKookmodus.bezig = false; box.hidden = true; box.innerHTML = ''; if (S.laatsteDetail === r.id && $('#detailPane .detail')) { $('#detailPane').innerHTML = detailHTML(r); bindDetail(r); } try { wakeLock && wakeLock.release(); } catch (e) { } wakeLock = null; document.removeEventListener('keydown', toets); };
  const toets = e => { if (e.key === 'ArrowRight') $('#cookNext')?.click(); if (e.key === 'ArrowLeft') $('#cookPrev')?.click(); if (e.key === 'Escape') sluit(); };
  document.addEventListener('keydown', toets);
  let x0 = null;
  box.ontouchstart = e => { x0 = e.touches[0].clientX; };
  box.ontouchend = e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 70) (dx < 0 ? $('#cookNext') : $('#cookPrev'))?.click(); x0 = null; };
  teken();
}
const timers = [];
function startTimer(sec, label) {
  const t = { eind: Date.now() + sec * 1000, label, id: Math.random() };
  timers.push(t); tekenTimers();
  if (!startTimer.iv) startTimer.iv = setInterval(tekenTimers, 1000);
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => { });
}
function piep() {
  try { const ac = new (window.AudioContext || window.webkitAudioContext)(); [0, .35, .7].forEach(d => { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 880; o.connect(g); g.connect(ac.destination); g.gain.setValueAtTime(.25, ac.currentTime + d); o.start(ac.currentTime + d); o.stop(ac.currentTime + d + .2); }); } catch (e) { }
  try { navigator.vibrate && navigator.vibrate([300, 150, 300, 150, 300]); } catch (e) { }
}
function tekenTimers() {
  let bar = $('.timerbar');
  if (!timers.length) { bar && bar.remove(); clearInterval(startTimer.iv); startTimer.iv = null; return; }
  if (!bar) { bar = document.createElement('div'); bar.className = 'timerbar'; document.body.appendChild(bar); }
  bar.innerHTML = timers.map(t => {
    const s = Math.round((t.eind - Date.now()) / 1000);
    if (s <= 0 && !t.afgegaan) { t.afgegaan = true; piep(); try { new Notification('Timer klaar', { body: t.label }); } catch (e) { } }
    const a = Math.max(0, s), mm = Math.floor(a / 60), ss = String(a % 60).padStart(2, '0');
    return `<div class="timer ${s <= 0 ? 'ring' : ''}"><span>${s <= 0 ? 'Klaar!' : `${mm}:${ss}`}</span><small>${esc(t.label)}</small><button data-stop="${t.id}" aria-label="Stop">✕</button></div>`;
  }).join('');
  bar.querySelectorAll('[data-stop]').forEach(b => b.onclick = () => { const i = timers.findIndex(t => String(t.id) === b.dataset.stop); timers.splice(i, 1); tekenTimers(); });
}

// ------------------------------------------------------------------ boodschappenlijst
function boodschappenItems() {
  const map = new Map();
  for (const l of S.lijst) {
    const r = vind(l.id); if (!r) continue;
    const groepen = parseIngredienten(r.ingredienten).filter(g => !g.variant || g.titel === (l.variant || gekozenVariant(r, parseIngredienten(r.ingredienten))));
    for (const g of groepen) for (const it of g.items) {
      let q = it.q, q2 = it.q2, unit = it.unit;
      if (unit === 'kg') { q *= 1000; q2 = q2 && q2 * 1000; unit = 'g'; }
      if (unit === 'l') { q *= 1000; q2 = q2 && q2 * 1000; unit = 'ml'; }
      const naam = it.q != null ? it.naam : it.raw;
      const key = sleutelNaam(naam) + '|' + (q != null ? unit : '-');
      const e = map.get(key) || { key, naam: naam.split(/,/)[0].replace(/\s*\(.*?\)\s*/g, ' ').trim(), unit, q: 0, q2: 0, heeftQ: false, bereik: false, van: new Set(), basis: sleutelNaam(naam) };
      if (q != null) { e.q += q * l.factor; e.q2 += (q2 ?? q) * l.factor; e.heeftQ = true; if (q2 != null) e.bereik = true; }
      e.van.add(r.naam);
      map.set(key, e);
    }
  }
  for (const x of S.extra) map.set('extra|' + x.tekst, { key: 'extra|' + x.tekst, naam: x.tekst, van: new Set(['zelf toegevoegd']), basis: norm(x.tekst), extra: true });
  return [...map.values()];
}
function renderBoodschappen(el) {
  const items = boodschappenItems();
  const inHuis = items.filter(i => !i.extra && S.voorraad.has(i.basis));
  const kopen = items.filter(i => !inHuis.includes(i));
  const groepen = {};
  kopen.forEach(i => (groepen[i.extra ? 'Zelf toegevoegd' : afdeling(i.basis)] ||= []).push(i));
  const volg = [...AFDELINGEN.map(a => a[0]), 'Overig', 'Zelf toegevoegd'];
  const hv = i => i.heeftQ ? (i.bereik ? `${fmt(i.q)}–${fmt(i.q2)}` : fmt(i.q)) + (i.unit ? ' ' + i.unit : '') : '';
  const rij = (i, huis) => `<div class="shop-item ${S.afgevinkt.has(i.key) ? 'done' : ''}"><label><input type="checkbox" data-key="${esc(i.key)}" ${S.afgevinkt.has(i.key) ? 'checked' : ''}>
      <span><span class="what">${hv(i) ? `<b>${esc(hv(i))}</b> ` : ''}${esc(i.naam)}</span><span class="from">${esc([...i.van].join(' · '))}</span></span></label>
      ${i.extra ? `<button class="pantry-btn" data-del="${esc(i.naam)}">Verwijder</button>` : `<button class="pantry-btn" data-huis="${esc(i.basis)}">${huis ? 'Toch kopen' : 'Heb ik altijd'}</button>`}</div>`;
  const aantalOpen = kopen.filter(i => !S.afgevinkt.has(i.key)).length;
  el.innerHTML = `<div class="topbar"><h1>Boodschappen</h1>
      <div class="row-between"><span class="count">${S.lijst.length ? `${aantalOpen} van ${kopen.length} nog te halen` : 'Je lijst is leeg'}</span>
      <span>${items.length ? `<button class="btn small" id="deel">${ICON.share} Delen</button>` : ''}</span></div></div>
    <div class="pane-inner">
      ${S.lijst.length ? `<div class="section"><h3>Recepten op je lijst</h3>${S.lijst.map(l => { const r = vind(l.id); if (!r) return ''; const b = getal(r.porties);
        return `<div class="shop-recipe"><a href="#/r/${encodeURIComponent(r.id)}">${esc(r.naam)}<span class="from count" style="display:block;font-weight:400">${b ? fmt(b * l.factor) + ' porties' : '× ' + fmt(l.factor)}${l.variant ? ' · ' + esc(l.variant) : ''}</span></a>
          <span class="stepper"><button data-rf="${esc(r.id)}" data-d="-1">−</button><button data-rf="${esc(r.id)}" data-d="1">+</button></span>
          <button class="pantry-btn" data-weg="${esc(r.id)}">Verwijder</button></div>`; }).join('')}</div>` : `<div class="empty">Open een recept en tik op <b>Op boodschappenlijst</b>.<br>De ingrediënten van alle gekozen recepten worden hier samengeteld per winkelafdeling.</div>`}
      ${volg.filter(a => groepen[a]).map(a => `<div class="section"><h3>${esc(a)}</h3>${groepen[a].sort((x, y) => x.naam.localeCompare(y.naam, 'nl')).map(i => rij(i, false)).join('')}</div>`).join('')}
      <div class="section"><h3>Zelf iets toevoegen</h3><form class="addrow" id="addForm"><input type="text" id="addTxt" placeholder="bv. 1 l melk, keukenrol"><button class="btn primary small">${ICON.plus}</button></form></div>
      ${inHuis.length ? `<div class="section"><h3>Heb ik altijd in huis <small class="count">niet op de lijst</small></h3>${inHuis.map(i => rij(i, true)).join('')}</div>` : ''}
      ${items.length ? `<div class="actions"><button class="btn" id="wisAf">Afgevinkte wissen</button><button class="btn" id="wisAlles">Lijst leegmaken</button></div>` : ''}
    </div>`;
  el.querySelectorAll('[data-key]').forEach(c => c.onchange = () => { c.checked ? S.afgevinkt.add(c.dataset.key) : S.afgevinkt.delete(c.dataset.key); bewaarLijst(); renderBoodschappen(el); });
  el.querySelectorAll('[data-huis]').forEach(b => b.onclick = () => { const k = b.dataset.huis; S.voorraad.has(k) ? S.voorraad.delete(k) : S.voorraad.add(k); bewaarLijst(); renderBoodschappen(el); });
  el.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { S.extra = S.extra.filter(x => x.tekst !== b.dataset.del); bewaarLijst(); renderBoodschappen(el); });
  el.querySelectorAll('[data-weg]').forEach(b => b.onclick = () => { S.lijst = S.lijst.filter(x => x.id !== b.dataset.weg); bewaarLijst(); renderBoodschappen(el); });
  el.querySelectorAll('[data-rf]').forEach(b => b.onclick = () => {
    const l = S.lijst.find(x => x.id === b.dataset.rf); const r = vind(l.id); const basis = getal(r.porties); const d = Number(b.dataset.d);
    if (basis) { const p = Math.max(1, Math.round(basis * l.factor) + d); l.factor = p / basis; } else l.factor = Math.max(.5, l.factor + d * .5);
    bewaarLijst(); renderBoodschappen(el);
  });
  $('#addForm', el).onsubmit = e => { e.preventDefault(); const t = $('#addTxt', el).value.trim(); if (t) { S.extra.push({ tekst: t }); bewaarLijst(); renderBoodschappen(el); } };
  const wa = $('#wisAf', el); if (wa) wa.onclick = () => { const af = items.filter(i => S.afgevinkt.has(i.key)); S.extra = S.extra.filter(x => !S.afgevinkt.has('extra|' + x.tekst)); af.forEach(i => S.afgevinkt.delete(i.key)); bewaarLijst(); renderBoodschappen(el); toast('Afgevinkte items gewist (recepten blijven op de lijst)'); };
  const wl = $('#wisAlles', el); if (wl) wl.onclick = () => { if (!confirm('Volledige boodschappenlijst leegmaken?')) return; S.lijst = []; S.extra = []; S.afgevinkt.clear(); bewaarLijst(); renderBoodschappen(el); };
  const dl = $('#deel', el); if (dl) dl.onclick = async () => {
    const tekst = 'Boodschappen\n' + volg.filter(a => groepen[a]).map(a => `\n${a}\n` + groepen[a].filter(i => !S.afgevinkt.has(i.key)).map(i => `- ${hv(i) ? hv(i) + ' ' : ''}${i.naam}`).join('\n')).join('\n');
    try { if (navigator.share) await navigator.share({ title: 'Boodschappen', text: tekst }); else { await navigator.clipboard.writeText(tekst); toast('Lijst gekopieerd'); } } catch (e) { }
  };
}

// ------------------------------------------------------------------ info
function renderInfo(el, arg) {
  const cats = S.data.categorieen;
  if (arg) {
    const c = cats.find(x => x.categorie === arg);
    const items = S.data.recepten.filter(r => r.categorie === arg && r.soort === 'info');
    el.innerHTML = `<div class="detail-head"><a class="iconbtn" href="#/info" aria-label="Terug">${ICON.back}</a></div>
      <div class="pane-inner detail"><div class="kicker">Info</div><h2>${esc(arg)}</h2>${c && c.beschrijving ? `<p class="lead">${esc(c.beschrijving)}</p>` : ''}
      ${c && c.extra ? `<div class="section md">${md(c.extra)}</div>` : ''}
      ${items.map(r => `<div class="section md"><h3>${esc(r.naam)}</h3>${r.beschrijving ? `<p>${esc(r.beschrijving)}</p>` : ''}${md(r.extra)}</div>`).join('')}
      ${S.data.recepten.some(r => r.categorie === arg && r.soort !== 'info') ? `<p><a class="btn" href="#/" onclick="S.filter.cat=${esc(JSON.stringify(arg))}">Recepten in deze categorie</a></p>` : ''}
      </div>`;
    return;
  }
  el.innerHTML = `<div class="topbar"><h1>Info &amp; tips</h1><p class="count" style="margin:0">Kerntemperaturen, bewaren, omrekenen en de uitgangspunten per hoofdstuk.</p></div>
    <div class="list">${cats.map(c => {
      const n = S.data.recepten.filter(r => r.categorie === c.categorie && r.soort === 'info').length;
      return `<a class="card" href="#/info/${encodeURIComponent(c.categorie)}"><div class="ic info">${c.nr ?? 'i'}</div><div><h3>${esc(c.categorie)}</h3><div class="meta"><span>${esc(c.beschrijving || '')}</span>${n ? `<span>${n} onderdelen</span>` : ''}</div></div></a>`;
    }).join('')}</div>`;
}

// ------------------------------------------------------------------ instellingen
function renderStatus() {
  const s = $('#syncStatus'); if (!s) return;
  s.textContent = S.syncBezig ? 'Bezig met synchroniseren…' :
    (dataUrl() ? (S.laatsteSync ? 'Laatst gesynchroniseerd: ' + new Date(S.laatsteSync).toLocaleString('nl-BE') : 'Nog niet gesynchroniseerd') : 'Geen Google-koppeling: je gebruikt de recepten uit de app zelf.') +
    (S.wachtrij.length ? ` · ${S.wachtrij.length} wijziging(en) wachten op internet` : '');
}
function renderInstellingen(el) {
  const i = S.instellingen;
  el.innerHTML = `<div class="topbar"><h1>Meer</h1></div><div class="pane-inner">
    <div class="section"><h3>Recept toevoegen</h3><p style="margin-top:0">Voeg een recept toe vanop je gsm. Het wordt opgeslagen in je Google Sheet (of later, zodra je weer online bent).</p>
      <a class="btn primary" href="#/nieuw">${ICON.plus} Nieuw recept</a> ${sheetUrl() ? `<a class="btn" href="${esc(sheetUrl())}" target="_blank" rel="noopener">Open Google Sheet</a>` : ''}</div>
    <div class="section"><h3>Synchronisatie</h3>
      <p class="status-line" id="syncStatus"></p>
      <p class="status-line">${S.data.recepten.filter(r => r.soort !== 'info').length} recepten en ${S.data.recepten.filter(r => r.soort === 'info').length} info-onderdelen offline beschikbaar.</p>
      <button class="btn primary" id="syncNu">${ICON.sync} Nu synchroniseren</button></div>
    <div class="section"><h3>Google-koppeling</h3>
      <label class="field"><span>Web-app-adres (Apps Script) <small>eindigt op /exec ${CFG.dataUrl ? '– standaard al ingesteld in config.js' : ''}</small></span><input type="url" id="sUrl" value="${esc(i.dataUrl)}" placeholder="${esc(CFG.dataUrl || 'https://script.google.com/macros/s/…/exec')}"></label>
      <label class="field"><span>Schrijfsleutel <small>nodig om vanuit de app recepten op te slaan</small></span><input type="password" id="sKey" value="${esc(i.sleutel)}" autocomplete="off"></label>
      <label class="field"><span>Link naar je Google Sheet <small>optioneel</small></span><input type="url" id="sSheet" value="${esc(i.sheetUrl)}" placeholder="${esc(CFG.sheetUrl || 'https://docs.google.com/spreadsheets/d/…')}"></label>
      <label class="field"><span>Weergave</span><select class="input" id="sThema"><option value="">Volgens toestel</option><option value="light" ${i.thema === 'light' ? 'selected' : ''}>Licht</option><option value="dark" ${i.thema === 'dark' ? 'selected' : ''}>Donker</option></select></label>
      <button class="btn primary" id="sBewaar">Opslaan</button></div>
    <div class="section"><h3>Back-up</h3><p style="margin-top:0">Download alle recepten zoals ze nu op dit toestel staan (JSON).</p><button class="btn" id="export">Download back-up</button></div>
    <p class="note">Sterk &amp; Smaakvol – persoonlijk kookboek van Bradley Olivier.</p>
  </div>`;
  renderStatus();
  $('#syncNu', el).onclick = () => sync(true);
  $('#sBewaar', el).onclick = () => {
    Object.assign(S.instellingen, { dataUrl: $('#sUrl', el).value.trim(), sleutel: $('#sKey', el).value.trim(), sheetUrl: $('#sSheet', el).value.trim(), thema: $('#sThema', el).value });
    opslag.set('instellingen', S.instellingen); thema(); toast('Instellingen bewaard'); renderInstellingen(el); if (dataUrl()) sync(true);
  };
  $('#export', el).onclick = () => {
    const d = { bijgewerkt: new Date().toISOString(), categorieen: S.data.categorieen, recepten: S.data.recepten.map(({ _zoek, ...r }) => r) };
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 1)], { type: 'application/json' }));
    a.download = 'kookboek-backup-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
  };
}
function thema() { const t = S.instellingen.thema; t ? document.documentElement.setAttribute('data-theme', t) : document.documentElement.removeAttribute('data-theme'); }

// ------------------------------------------------------------------ formulier nieuw/bewerken
function renderFormulier(el, id) {
  const r = id ? vind(id) : null;
  const v = k => esc(r ? (r[k] ?? '') : '');
  const cats = [...new Set([...S.data.categorieen.map(c => c.categorie), ...S.data.recepten.map(x => x.categorie)])];
  el.innerHTML = `<div class="detail-head"><button class="iconbtn" onclick="history.back()" aria-label="Terug">${ICON.back}</button><b>${r ? 'Recept bewerken' : 'Nieuw recept'}</b></div>
  <form class="pane-inner" id="rf">
    <label class="field"><span>Naam *</span><input type="text" name="naam" required value="${v('naam')}"></label>
    <div class="grid2"><label class="field"><span>Categorie *</span><select class="input" name="categorie">${cats.map(c => `<option ${r && r.categorie === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}<option value="__nieuw">+ Nieuwe categorie…</option></select></label>
      <label class="field"><span>Soort</span><select class="input" name="soort"><option value="recept">Recept</option><option value="info" ${r && r.soort === 'info' ? 'selected' : ''}>Info / tip</option></select></label></div>
    <label class="field"><span>Korte beschrijving</span><textarea name="beschrijving" style="min-height:70px">${v('beschrijving')}</textarea></label>
    <div class="grid3"><label class="field"><span>Porties</span><input type="number" name="porties" min="1" value="${v('porties')}"></label>
      <label class="field"><span>Voorbereiding (min)</span><input type="number" name="voorbereiding_min" value="${v('voorbereiding_min')}"></label>
      <label class="field"><span>Bereiding (min)</span><input type="number" name="bereiding_min" value="${v('bereiding_min')}"></label></div>
    <div class="grid2"><label class="field"><span>Totaal (min)</span><input type="number" name="totaal_min" value="${v('totaal_min')}"></label>
      <label class="field"><span>Moeilijkheid</span><input type="text" name="moeilijkheid" value="${v('moeilijkheid')}" placeholder="Gemakkelijk"></label></div>
    <label class="field"><span>Tags <small>komma-gescheiden</small></span><input type="text" name="tags" value="${v('tags')}" placeholder="Eiwitrijk, Mealprep, Kip"></label>
    <label class="field"><span>Ingrediënten <small>één per regel: "600 g kipfilet", "2 st eieren", "## Saus" voor een groep</small></span><textarea name="ingredienten" style="min-height:180px">${v('ingredienten')}</textarea></label>
    <label class="field"><span>Bereiding <small>één stap per regel</small></span><textarea name="stappen" style="min-height:180px">${v('stappen')}</textarea></label>
    <div class="grid3"><label class="field"><span>kcal / portie</span><input type="number" step="any" name="kcal" value="${v('kcal')}"></label>
      <label class="field"><span>Eiwit (g)</span><input type="number" step="any" name="eiwit" value="${v('eiwit')}"></label>
      <label class="field"><span>Koolhydr. (g)</span><input type="number" step="any" name="koolhydraten" value="${v('koolhydraten')}"></label></div>
    <div class="grid3"><label class="field"><span>Vet (g)</span><input type="number" step="any" name="vet" value="${v('vet')}"></label>
      <label class="field"><span>Vezels (g)</span><input type="number" step="any" name="vezels" value="${v('vezels')}"></label>
      <label class="field"><span>Portiegewicht</span><input type="text" name="portiegewicht" value="${v('portiegewicht')}"></label></div>
    <label class="field"><span>Extra info <small>bewaren, variaties, tips – "## Kopje" en "- punt" mogen</small></span><textarea name="extra">${v('extra')}</textarea></label>
    <div class="actions"><button class="btn primary">Opslaan</button><button type="button" class="btn" onclick="history.back()">Annuleren</button></div>
    ${!dataUrl() || !S.instellingen.sleutel ? '<p class="note">Let op: zonder Google-koppeling en schrijfsleutel (zie Meer) wordt het recept enkel op dit toestel bewaard.</p>' : ''}
    <div style="height:40px"></div>
  </form>`;
  $('[name=categorie]', el).onchange = e => { if (e.target.value === '__nieuw') { const n = prompt('Naam van de nieuwe categorie'); if (n) { const o = new Option(n, n, true, true); e.target.add(o, e.target.options.length - 1); } else e.target.selectedIndex = 0; } };
  $('#rf', el).onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target); const rec = Object.assign({}, r ? (({ _zoek, ...x }) => x)(r) : {});
    for (const [k, val] of fd.entries()) rec[k] = ['porties', 'voorbereiding_min', 'bereiding_min', 'totaal_min', 'kcal', 'eiwit', 'koolhydraten', 'vet', 'vezels'].includes(k) ? (val === '' ? null : Number(val)) : val.trim();
    if (!r) { rec.id = norm(rec.naam).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60); let b = rec.id, n = 2; while (vind(rec.id)) rec.id = b + '-' + n++; rec.toegevoegd = new Date().toISOString().slice(0, 10); rec.volgorde = Math.max(0, ...S.data.recepten.map(x => x.volgorde || 0)) + 1; if (!rec.voedingswaarden_basis) rec.voedingswaarden_basis = 'per portie'; }
    else rec.gewijzigd = new Date().toISOString().slice(0, 10);
    // lokaal meteen bijwerken
    const d = { categorieen: S.data.categorieen, recepten: S.data.recepten.filter(x => x.id !== rec.id).map(({ _zoek, ...x }) => x).concat([rec]), bijgewerkt: S.data.bijgewerkt };
    zetData(d); await cacheSchrijf(d);
    if (dataUrl() && S.instellingen.sleutel) { S.wachtrij.push({ actie: 'opslaan', recept: rec }); opslag.set('wachtrij', S.wachtrij); verstuurWachtrij().then(() => { renderStatus(); toast(S.wachtrij.length ? 'Bewaard op dit toestel; wordt naar Google gestuurd zodra je online bent' : 'Opgeslagen in je Google Sheet'); }); }
    else toast('Bewaard op dit toestel');
    location.hash = '#/r/' + encodeURIComponent(rec.id);
  };
}

// ------------------------------------------------------------------ start
thema();
addEventListener('online', () => sync(false));
addEventListener('resize', () => { clearTimeout(render.rt); render.rt = setTimeout(() => { const w = matchMedia('(min-width: 900px)').matches; if (w !== render.w) { render.w = w; render(); } }, 200); });
render.w = matchMedia('(min-width: 900px)').matches;
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && dataUrl() && (!S.laatsteSync || Date.now() - new Date(S.laatsteSync) > 10 * 60 * 1000)) sync(false); });
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  // nieuwe app-versie geïnstalleerd: één keer herladen zodat je ze meteen ziet
  const hadVersie = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadVersie && !startKookmodus.bezig) location.reload(); });
  navigator.serviceWorker.register('sw.js').catch(() => { });
}
laad();
