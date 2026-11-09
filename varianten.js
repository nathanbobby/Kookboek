/* Multicooker-varianten: welke bereiding (fornuis, snelkoken, slowcook) is beschikbaar en actief.
 * Een variant bestaat als zijn stappenveld niet leeg is; een leeg ingrediëntenveld valt terug op de gewone ingrediënten.
 */
(function (root) {
  'use strict';
  const LABELS = { fornuis: 'Fornuis', snel: 'Snelkoken', slow: 'Slowcook' };
  const VELD = { snel: 'mc_snel', slow: 'mc_slow' };
  const tekst = v => String(v ?? '').trim();

  function parseInstellingen(t) {
    return tekst(t).split('|').map(d => d.trim()).filter(Boolean).map(d => {
      const i = d.indexOf(':');
      return i > 0 ? { sleutel: d.slice(0, i).trim(), waarde: d.slice(i + 1).trim() } : { sleutel: '', waarde: d };
    });
  }

  function beschikbareVarianten(r) {
    const lijst = [];
    if (tekst(r.stappen) || tekst(r.ingredienten)) lijst.push('fornuis');
    for (const v of ['snel', 'slow']) if (tekst(r[VELD[v] + '_stappen'])) lijst.push(v);
    return lijst;
  }

  function kiesVariant(r, voorkeur) {
    const b = beschikbareVarianten(r);
    if (voorkeur && b.includes(voorkeur)) return voorkeur;
    return b.includes('fornuis') ? 'fornuis' : (b[0] || 'fornuis');
  }

  function receptVoorVariant(r, variant) {
    const v = kiesVariant(r, variant);
    if (v === 'fornuis') return { variant: v, ingredienten: tekst(r.ingredienten), stappen: tekst(r.stappen), instellingen: [], tips: '' };
    const p = VELD[v];
    return {
      variant: v,
      ingredienten: tekst(r[p + '_ingredienten']) || tekst(r.ingredienten),
      stappen: tekst(r[p + '_stappen']),
      instellingen: parseInstellingen(r[p + '_instellingen']),
      tips: tekst(r.mc_tips)
    };
  }

  const api = { LABELS, parseInstellingen, beschikbareVarianten, kiesVariant, receptVoorVariant };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Varianten = api;
})(typeof window !== 'undefined' ? window : this);
