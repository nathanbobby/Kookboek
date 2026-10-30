/* Hoeveelheden per bereidingsstap.
 * - schaalStap(tekst, factor, ingredienten): rekent hoeveelheden in de staptekst om
 *   (gram, ml, el, ... en telbare ingrediënten zoals "8 wraps"); tijden, temperaturen en maten blijven.
 * - stapIngredienten(tekst, ingredienten): welke ingrediënten in een stap vernoemd worden zonder hoeveelheid.
 * Ingrediënten zijn objecten {q, q2, unit, naam, raw} zoals parseRegel() in app.js ze maakt.
 */
(function (root) {
  'use strict';
  const norm = s => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

  const EENHEID_RE = /^(gram|g|gr|kilogram|kg|milliliter|ml|liter|l|cl|dl|eetlepels?|el|theelepels?|tl|stuks?|st|teentjes?|tenen|blaadjes?|takjes?|plakjes?|snufjes?|blikken|blik|bosjes?|zakjes?|kopjes?|scheutjes?|bolletjes?|sneetjes?|sneden|plakken)$/;
  // woorden waarna een getal géén hoeveelheid is
  const GEEN_HOEVEELHEID = /^(minuten|minuut|min|uur|uren|seconden|sec|graden|c|cm|centimeter|mm|millimeter|watt|w|keer|dagen|dag|weken|maanden|porties|portie|potten|glazen|kommen|stappen|delen|procent)$/;
  const STOP = new Set(('rauwe rauw verse vers gekookte gekookt ongekookte magere mager halfvolle volle light natuur fijn fijngesneden ' +
    'gesneden blokjes blokje stukjes stukken ongeveer per stuk van voor met zonder extra sterke afgekoelde koude koud warme ' +
    'gerookt gerookte zoete zoet rode groene gele witte grote kleine middelgrote ongezoet ongezouten bevroren diepvries ' +
    'uitgelekte uitgelekt geraspte geraspt gedroogde gedroogd droge naar keuze optioneel bereid uit griekse lange korte ' +
    'gemalen hele halve dunne dikke reepjes ringen partjes plakjes schijfjes gram ml liter vloeibare zachte harde jonge oude ' +
    'pure zure mild milde pittige vanille vloeibaar').split(' '));
  // gewone schrijfwijzen in stappen -> woord dat in de ingrediëntnaam staat
  const SYNONIEMEN = {
    whey: ['eiwitpoeder', 'proteinepoeder', 'whey'], proteinepoeder: ['eiwitpoeder'], eiwitpoeder: ['proteinepoeder', 'whey'],
    cacao: ['cacaopoeder'], kip: ['kipfilet', 'kippendijen', 'kippendij', 'kipdijen', 'kipgehakt', 'kippenbouillon'],
    olie: ['olijfolie', 'zonnebloemolie', 'sesamolie', 'olie'], eieren: ['ei', 'eieren'], ei: ['ei', 'eieren'],
    haver: ['havermout', 'havervlokken'], havermout: ['havervlokken'], havervlokken: ['havermout'],
    rijst: ['jasmijnrijst', 'basmatirijst', 'rijst'], kaas: ['kaas'], vanille: ['vanille-extract', 'vanillepoeder', 'vanille'],
    zoetstof: ['zoetstof', 'suikervervanger'], gehakt: ['gehakt', 'rundergehakt', 'kipgehakt', 'varkensgehakt']
  };
  const getal = s => parseFloat(String(s).replace(',', '.'));
  function fmt(n) {
    const r = n >= 20 ? Math.round(n) : n >= 2 ? Math.round(n * 2) / 2 : Math.round(n * 100) / 100;
    return String(r).replace('.', ',');
  }
  // woorden die het begin van een ingrediëntnaam vormen (voor "8 wraps", "2 eieren", "8 caloriearme wraps")
  function telwoorden(items) {
    const s = new Set();
    for (const it of items || []) {
      const basis = norm(it.naam).replace(/\(.*?\)/g, ' ').split(/,| van | voor | met | of /)[0];
      for (const w of basis.split(/[^a-z-]+/)) if (w.length >= 2 && !EENHEID_RE.test(w) && !GEEN_HOEVEELHEID.test(w)) s.add(w);
    }
    return s;
  }
  const isTelwoord = (tel, w) => tel.has(w) || [...tel].some(t => !STOP.has(t) && t.length >= 4 && w.length >= 4 && (t.startsWith(w) || w.startsWith(t)));

  function schaalStap(tekst, f, items) {
    const tel = telwoorden(items);
    const delen = []; let laatste = 0;
    const re = /(\d+(?:[.,]\d+)?)(?:(\s*(?:tot|-|–)\s*)(\d+(?:[.,]\d+)?))?(\s*)([\p{L}]+(?:-[\p{L}]+)*)/gu;
    let m;
    while ((m = re.exec(tekst))) {
      const voor = tekst[m.index - 1];
      if (voor && /[\p{L}\d°.,/]/u.test(voor) && !/\s/.test(voor)) continue;
      const woord = norm(m[5]);
      const isEenheid = EENHEID_RE.test(woord);
      const isTel = !isEenheid && m[4].length > 0 && !GEEN_HOEVEELHEID.test(woord) && isTelwoord(tel, woord);
      if (!isEenheid && !isTel) continue;
      if (!isEenheid && !m[4]) continue;
      const a = f === 1 ? m[1] : fmt(getal(m[1]) * f);
      const b = m[3] ? m[2] + (f === 1 ? m[3] : fmt(getal(m[3]) * f)) : '';
      if (m.index > laatste) delen.push(tekst.slice(laatste, m.index));
      delen.push({ tekst: a + b + m[4] + m[5], hoeveelheid: true });
      laatste = m.index + m[0].length;
    }
    if (laatste < tekst.length) delen.push(tekst.slice(laatste));
    return delen;
  }

  function tokens(tekst) {
    // woorden (samenstellingen met koppelteken blijven één token), getallen en leestekens die een zinsdeel afsluiten
    return (norm(tekst).match(/\d+(?:[.,]\d+)?|[a-z]+(?:-[a-z]+)*|[,;.:()]/g) || []);
  }
  function sleutelwoorden(naam) {
    const basis = norm(naam).replace(/\(.*?\)/g, ' ').split(/,| of | voor | om | van | met /)[0];
    const s = new Set();
    for (const w of basis.split(/[^a-z-]+/).filter(Boolean)) {
      if (!STOP.has(w) && w.length >= 3) s.add(w);
      if (w.includes('-')) for (const d of w.split('-')) if (!STOP.has(d) && d.length >= 3) s.add(d);
    }
    return s;
  }
  // woorden die in stappen meestal naar iets zelfgemaakts verwijzen, niet naar één ingrediënt
  const GENERIEK = new Set('saus sausje sauzen dressing mengsel marinade beslag vulling topping basis mix glaze'.split(' '));
  function past(stapWoord, sleutel) {
    if (GENERIEK.has(stapWoord)) return 0;
    if (stapWoord === sleutel) return 2;
    const kand = SYNONIEMEN[stapWoord] || [];
    if (kand.includes(sleutel)) return 2;
    if (stapWoord.length >= 4 && sleutel.length >= 4 && !stapWoord.includes('-') && (sleutel.startsWith(stapWoord) || stapWoord.startsWith(sleutel))) return 1;
    if (stapWoord.includes('-') && stapWoord.startsWith(sleutel + '-')) return 1;
    // samenstellingen: "bouillon" -> "runderbouillon", "mosterd" -> "dijonmosterd"
    if (stapWoord.length >= 5 && !stapWoord.includes('-') && sleutel.endsWith(stapWoord)) return 1;
    return 0;
  }
  function expliciet(tok, j) {
    for (let k = j - 1; k >= Math.max(0, j - 5); k--) {
      const t = tok[k];
      if (/^[,;.:()]$/.test(t) || GEEN_HOEVEELHEID.test(t)) return false;
      if (/^\d/.test(t)) return true;
    }
    return false;
  }

  function stapIngredienten(tekst, items, opties) {
    const tok = tokens(tekst);
    const kandidaten = (items || []).filter(it => it.q != null).map(it => ({ item: it, sleutels: sleutelwoorden(it.naam) }));
    if (!kandidaten.length) return [];
    // score per ingrediënt: hoeveel van zijn sleutelwoorden in de stap voorkomen
    const score = new Map();
    for (const k of kandidaten) {
      let n = 0; for (const s of k.sleutels) if (tok.some(t => past(t, s))) n++;
      score.set(k, n);
    }
    const status = new Map(); // kandidaat -> {eerste, expliciet}
    tok.forEach((t, j) => {
      if (!/^[a-z]/.test(t) || t.length < 3 || STOP.has(t)) return;
      let best = [], bestWaarde = 0;
      for (const k of kandidaten) {
        let p = 0; for (const s of k.sleutels) p = Math.max(p, past(t, s));
        if (!p) continue;
        const waarde = p * 10 + score.get(k);
        if (waarde > bestWaarde) { best = [k]; bestWaarde = waarde; } else if (waarde === bestWaarde) best.push(k);
      }
      const exp = expliciet(tok, j);
      for (const k of best) {
        const st = status.get(k) || { eerste: j, expliciet: false };
        st.expliciet = st.expliciet || exp;
        status.set(k, st);
      }
    });
    const lijst = [...status.entries()].sort((a, b) => a[1].eerste - b[1].eerste);
    if (opties && opties.alles) return lijst.map(([k, st]) => ({ item: k.item, expliciet: st.expliciet }));
    return lijst.filter(([, st]) => !st.expliciet).map(([k]) => ({ item: k.item }));
  }

  // Per recept: toon een ingrediënt alleen bij de eerste stap waarin het voorkomt
  // (een latere "haal de kip uit de pan" herhaalt dan niet de volledige hoeveelheid).
  function perStap(stappen, items) {
    const gezien = new Set();
    return stappen.map(st => {
      const res = [];
      for (const x of stapIngredienten(st, items, { alles: true })) {
        if (gezien.has(x.item)) continue;
        gezien.add(x.item);
        if (!x.expliciet) res.push({ item: x.item });
      }
      return res;
    });
  }

  const api = { schaalStap, stapIngredienten, perStap };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Stappen = api;
})(typeof window !== 'undefined' ? window : this);
