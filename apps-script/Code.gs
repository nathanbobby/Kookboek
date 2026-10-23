/**
 * Kookboek – Google Sheets database + sync voor de Kookboek-app
 * ---------------------------------------------------------------
 * - De tab "Recepten" is de database: 1 rij = 1 recept of info-onderdeel.
 * - De tab "Categorieën" bevat de hoofdstukken met hun intro.
 * - De web-app (Implementeren > Web-app) geeft alle data als JSON aan de app.
 * - Nieuwe recepten kunnen als JSON-bestand in de Drive-map "Kookboek Inbox"
 *   gezet worden (door jou of door een AI). Ze worden automatisch ingelezen.
 *
 * EENMALIG: vul STARTDATA_URL in en voer de functie "installeer" uit.
 */

// Adres van de recepten die bij de app horen (GitHub Pages). Enkel nodig bij de eerste installatie.
const STARTDATA_URL = 'https://JOUW-GITHUB-NAAM.github.io/kookboek/data/recepten.json';

const TAB_RECEPTEN = 'Recepten';
const TAB_CATEGORIEEN = 'Categorieën';
const TAB_UITLEG = 'Uitleg';

const KOLOMMEN = [
  ['id', 'ID'], ['soort', 'Soort'], ['categorie', 'Categorie'], ['subcategorie', 'Subcategorie'],
  ['naam', 'Naam'], ['beschrijving', 'Beschrijving'], ['moeilijkheid', 'Moeilijkheid'],
  ['voorbereiding_min', 'Voorbereiding (min)'], ['bereiding_min', 'Bereiding (min)'], ['totaal_min', 'Totaal (min)'],
  ['tijd_tekst', 'Tijd (tekst)'], ['porties', 'Porties'], ['portiegewicht', 'Portiegewicht / opbrengst'],
  ['tags', 'Tags'], ['keukengerei', 'Keukengerei'], ['ingredienten', 'Ingrediënten'], ['stappen', 'Bereiding (stappen)'],
  ['kcal', 'kcal'], ['eiwit', 'Eiwit (g)'], ['koolhydraten', 'Koolhydraten (g)'], ['suikers', 'Suikers (g)'],
  ['vet', 'Vet (g)'], ['verzadigd_vet', 'Verzadigd vet (g)'], ['vezels', 'Vezels (g)'], ['zout', 'Zout (g)'],
  ['voedingswaarden_basis', 'Voedingswaarden per'], ['extra', 'Extra info'],
  ['volgorde', 'Volgorde'], ['toegevoegd', 'Toegevoegd'], ['gewijzigd', 'Gewijzigd']
];
const GETAL_VELDEN = ['voorbereiding_min', 'bereiding_min', 'totaal_min', 'porties', 'kcal', 'eiwit', 'koolhydraten',
  'suikers', 'vet', 'verzadigd_vet', 'vezels', 'zout', 'volgorde'];
const CAT_KOLOMMEN = [['nr', 'Nr'], ['categorie', 'Categorie'], ['beschrijving', 'Beschrijving'], ['extra', 'Extra info']];

// ---------------------------------------------------------------- menu

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Kookboek')
    .addItem('Inbox nu importeren', 'importeerInboxMenu')
    .addItem('Sleutel en mappen tonen', 'toonInfo')
    .addSeparator()
    .addItem('Opmaak herstellen', 'maakOpmaak')
    .addToUi();
}

function importeerInboxMenu() {
  const r = importeerInbox();
  SpreadsheetApp.getUi().alert('Inbox: ' + r.toegevoegd + ' toegevoegd, ' + r.bijgewerkt + ' bijgewerkt, ' + r.fouten + ' met fout.');
}

function toonInfo() {
  const p = PropertiesService.getScriptProperties();
  SpreadsheetApp.getUi().alert(
    'Schrijfsleutel voor de app: ' + p.getProperty('SLEUTEL') +
    '\n\nInbox-map: https://drive.google.com/drive/folders/' + p.getProperty('INBOX_ID') +
    '\nVerwerkt-map: https://drive.google.com/drive/folders/' + p.getProperty('VERWERKT_ID'));
}

// ---------------------------------------------------------------- installatie

function installeer() {
  const ss = SpreadsheetApp.getActive();
  const p = PropertiesService.getScriptProperties();

  maakOpmaak();

  // Startdata importeren als de tab nog leeg is
  const sh = ss.getSheetByName(TAB_RECEPTEN);
  if (sh.getLastRow() < 2) {
    if (STARTDATA_URL.indexOf('JOUW-GITHUB-NAAM') >= 0) throw new Error('Vul eerst STARTDATA_URL in bovenaan het script.');
    const data = JSON.parse(UrlFetchApp.fetch(STARTDATA_URL).getContentText('UTF-8'));
    schrijfCategorieen(data.categorieen || []);
    const rijen = (data.recepten || []).map(naarRij);
    if (rijen.length) sh.getRange(2, 1, rijen.length, KOLOMMEN.length).setValues(rijen);
  }

  // Mappen naast de spreadsheet
  const bestand = DriveApp.getFileById(ss.getId());
  const ouder = bestand.getParents().hasNext() ? bestand.getParents().next() : DriveApp.getRootFolder();
  if (!p.getProperty('INBOX_ID')) p.setProperty('INBOX_ID', ouder.createFolder('Kookboek Inbox').getId());
  if (!p.getProperty('VERWERKT_ID')) p.setProperty('VERWERKT_ID', ouder.createFolder('Kookboek Verwerkt').getId());
  if (!p.getProperty('SLEUTEL')) p.setProperty('SLEUTEL', Utilities.getUuid().slice(0, 8));

  // Elke 15 minuten de inbox controleren
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'importeerInbox') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('importeerInbox').timeBased().everyMinutes(15).create();

  Logger.log('Klaar. Schrijfsleutel voor de app: ' + p.getProperty('SLEUTEL'));
  Logger.log('Inbox-map: https://drive.google.com/drive/folders/' + p.getProperty('INBOX_ID'));
}

function maakOpmaak() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(TAB_RECEPTEN) || ss.insertSheet(TAB_RECEPTEN, 0);
  zetKoppen(sh, KOLOMMEN.map(k => k[1]));
  // Tekstkolommen als platte tekst (voorkomt dat "2-3" een datum wordt)
  KOLOMMEN.forEach((k, i) => {
    if (GETAL_VELDEN.indexOf(k[0]) < 0) sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat('@');
  });
  sh.getRange(2, 1, sh.getMaxRows() - 1, KOLOMMEN.length).setWrap(true).setVerticalAlignment('top');
  const breed = { naam: 240, beschrijving: 280, ingredienten: 320, stappen: 420, extra: 420 };
  KOLOMMEN.forEach((k, i) => sh.setColumnWidth(i + 1, breed[k[0]] || 110));

  let c = ss.getSheetByName(TAB_CATEGORIEEN) || ss.insertSheet(TAB_CATEGORIEEN, 1);
  zetKoppen(c, CAT_KOLOMMEN.map(k => k[1]));
  c.setColumnWidth(2, 220); c.setColumnWidth(3, 320); c.setColumnWidth(4, 520);
  c.getRange(1, 1, c.getMaxRows(), 4).setWrap(true).setVerticalAlignment('top');

  let u = ss.getSheetByName(TAB_UITLEG) || ss.insertSheet(TAB_UITLEG);
  u.clear();
  u.getRange(1, 1, UITLEG.length, 1).setValues(UITLEG.map(r => [r])).setWrap(true);
  u.setColumnWidth(1, 900);
  u.getRange(1, 1).setFontSize(14).setFontWeight('bold');

  const leeg = ss.getSheetByName('Blad1') || ss.getSheetByName('Sheet1');
  if (leeg && leeg.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(leeg);
}

function zetKoppen(sh, koppen) {
  sh.getRange(1, 1, 1, koppen.length).setValues([koppen]).setFontWeight('bold').setBackground('#2f5d50').setFontColor('#ffffff');
  sh.setFrozenRows(1);
}

// ---------------------------------------------------------------- web-app

function doGet(e) {
  try { importeerInbox(); } catch (err) { /* inbox-fout mag het lezen niet blokkeren */ }
  return json({ ok: true, bijgewerkt: new Date().toISOString(), categorieen: leesCategorieen(), recepten: leesRecepten() });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.sleutel !== PropertiesService.getScriptProperties().getProperty('SLEUTEL')) return json({ ok: false, fout: 'Verkeerde sleutel' });
    if (body.actie === 'verwijder') return json({ ok: verwijder(body.id) });
    const r = bewaar(body.recept);
    return json({ ok: true, id: r.id, nieuw: r.nieuw });
  } catch (err) {
    return json({ ok: false, fout: String(err) });
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------- lezen

function leesRecepten() {
  const sh = SpreadsheetApp.getActive().getSheetByName(TAB_RECEPTEN);
  if (sh.getLastRow() < 2) return [];
  const koppen = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const sleutels = koppen.map(k => { const f = KOLOMMEN.find(x => x[1] === k || x[0] === k); return f ? f[0] : null; });
  return sh.getRange(2, 1, sh.getLastRow() - 1, koppen.length).getValues()
    .map(rij => {
      const o = {};
      rij.forEach((v, i) => {
        const s = sleutels[i]; if (!s) return;
        if (v instanceof Date) v = Utilities.formatDate(v, 'Europe/Brussels', 'yyyy-MM-dd');
        if (GETAL_VELDEN.indexOf(s) >= 0) v = (v === '' || v === null) ? null : Number(String(v).replace(',', '.'));
        o[s] = v;
      });
      return o;
    })
    .filter(o => o.naam);
}

function leesCategorieen() {
  const sh = SpreadsheetApp.getActive().getSheetByName(TAB_CATEGORIEEN);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues()
    .filter(r => r[1])
    .map(r => ({ nr: Number(r[0]) || null, categorie: r[1], beschrijving: r[2], extra: r[3] }));
}

function schrijfCategorieen(cats) {
  const sh = SpreadsheetApp.getActive().getSheetByName(TAB_CATEGORIEEN);
  if (!cats.length) return;
  sh.getRange(2, 1, cats.length, 4).setValues(cats.map(c => [c.nr, c.categorie, c.beschrijving || '', c.extra || '']));
}

// ---------------------------------------------------------------- schrijven

function naarRij(r) {
  return KOLOMMEN.map(k => {
    let v = r[k[0]];
    if (v === undefined || v === null) return '';
    if (Array.isArray(v)) v = v.join(k[0] === 'tags' ? ', ' : (k[0] === 'keukengerei' ? '; ' : '\n'));
    return v;
  });
}

function slug(s) {
  return String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

// Accepteert ook Nederlandse kolomnamen ("Naam", "Ingrediënten", ...) als sleutel
function normaliseer(r) {
  const o = {};
  Object.keys(r || {}).forEach(k => {
    const f = KOLOMMEN.find(x => x[0] === k || x[1].toLowerCase() === String(k).toLowerCase());
    o[f ? f[0] : k] = r[k];
  });
  if (!o.naam) throw new Error('Recept zonder "naam"');
  if (!o.categorie) throw new Error('Recept "' + o.naam + '" zonder "categorie"');
  if (!o.soort) o.soort = 'recept';
  return o;
}

function bewaar(invoer) {
  const r = normaliseer(invoer);
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = SpreadsheetApp.getActive().getSheetByName(TAB_RECEPTEN);
    const n = Math.max(sh.getLastRow() - 1, 0);
    const data = n ? sh.getRange(2, 1, n, KOLOMMEN.length).getValues() : [];
    const iId = 0, iNaam = 4, iVolg = KOLOMMEN.findIndex(k => k[0] === 'volgorde'), iToeg = KOLOMMEN.findIndex(k => k[0] === 'toegevoegd');
    let rijIdx = -1;
    if (r.id) rijIdx = data.findIndex(x => x[iId] === r.id);
    if (rijIdx < 0) rijIdx = data.findIndex(x => String(x[iNaam]).trim().toLowerCase() === String(r.naam).trim().toLowerCase());
    const vandaag = Utilities.formatDate(new Date(), 'Europe/Brussels', 'yyyy-MM-dd');
    if (rijIdx >= 0) {
      const oud = {}; KOLOMMEN.forEach((k, i) => oud[k[0]] = data[rijIdx][i]);
      const nieuw = Object.assign(oud, r, { id: oud.id, gewijzigd: vandaag });
      sh.getRange(rijIdx + 2, 1, 1, KOLOMMEN.length).setValues([naarRij(nieuw)]);
      return { id: nieuw.id, nieuw: false };
    }
    const ids = data.map(x => x[iId]);
    let id = r.id || slug(r.naam), basis = id, k = 2;
    while (ids.indexOf(id) >= 0) id = basis + '-' + (k++);
    const maxVolg = data.reduce((m, x) => Math.max(m, Number(x[iVolg]) || 0), 0);
    r.id = id; r.volgorde = r.volgorde || maxVolg + 1; r.toegevoegd = r.toegevoegd || vandaag;
    sh.getRange(n + 2, 1, 1, KOLOMMEN.length).setValues([naarRij(r)]);
    return { id: id, nieuw: true };
  } finally { lock.releaseLock(); }
}

function verwijder(id) {
  const sh = SpreadsheetApp.getActive().getSheetByName(TAB_RECEPTEN);
  const ids = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues().map(r => r[0]);
  const i = ids.indexOf(id);
  if (i < 0) return false;
  sh.deleteRow(i + 2);
  return true;
}

// ---------------------------------------------------------------- inbox

function importeerInbox() {
  const p = PropertiesService.getScriptProperties();
  const res = { toegevoegd: 0, bijgewerkt: 0, fouten: 0 };
  if (!p.getProperty('INBOX_ID')) return res;
  const inbox = DriveApp.getFolderById(p.getProperty('INBOX_ID'));
  const verwerkt = DriveApp.getFolderById(p.getProperty('VERWERKT_ID'));
  const files = inbox.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    if (f.getName().indexOf('FOUT - ') === 0) continue;
    try {
      let tekst;
      if (f.getMimeType() === MimeType.GOOGLE_DOCS) tekst = DocumentApp.openById(f.getId()).getBody().getText();
      else tekst = f.getBlob().getDataAsString('UTF-8');
      tekst = tekst.replace(/^﻿/, '').replace(/```(json)?/g, '').trim();
      let data = JSON.parse(tekst);
      if (data && data.recepten) data = data.recepten;
      if (!Array.isArray(data)) data = [data];
      data.forEach(r => { const x = bewaar(r); x.nieuw ? res.toegevoegd++ : res.bijgewerkt++; });
      f.moveTo(verwerkt);
    } catch (err) {
      res.fouten++;
      f.setName('FOUT - ' + f.getName());
      f.setDescription('Kon niet importeren: ' + err);
    }
  }
  return res;
}

// ---------------------------------------------------------------- uitleg-tab

const UITLEG = [
  'Kookboek – hoe werkt deze database?',
  'De tab "Recepten" is de bron voor de app. Eén rij = één recept (of info-onderdeel). Je mag rijen rechtstreeks aanpassen of toevoegen; de app haalt de wijzigingen op zodra ze internet heeft.',
  'Verplicht: Naam en Categorie. Soort = recept of info. ID mag je leeg laten (wordt automatisch gemaakt bij import via inbox of app).',
  'Ingrediënten: één per regel, begin met hoeveelheid en eenheid: "907 g rauwe kippendijen", "15 ml olijfolie", "2 st eieren", "1,5 tl zout", "2-3 el honing". Eenheden: g, kg, ml, l, el, tl, st, snufje, teentjes, blaadjes, takjes, plakjes, blik. Zo kan de app porties omrekenen en een boodschappenlijst maken.',
  'Groepen in ingrediënten: zet een regel "## Saus" boven een groep. Alternatieve varianten (je kiest er één): "## Variant: Gewoon" en "## Variant: Lichter".',
  'Bereiding (stappen): één stap per regel, zonder nummer.',
  'Tags: komma-gescheiden (bv. Eiwitrijk, Mealprep, Airfryer, Kip, Vriezer). Keukengerei: gescheiden door "; ".',
  'Voedingswaarden: getallen per portie (kcal, eiwit, ...). "Voedingswaarden per" zegt waarop ze slaan (standaard per portie).',
  'Extra info: vrije tekst in markdown: "## Kopje", "- opsomming", tabellen met | kolom | kolom |.',
  '',
  'Recepten toevoegen via de Drive-inbox (ideaal voor AI):',
  'Zet een bestand (.json, of een Google Doc met JSON-tekst) in de map "Kookboek Inbox". Binnen 15 minuten (of meteen als je de app opent) wordt het recept toegevoegd en verhuist het bestand naar "Kookboek Verwerkt". Bestaat er al een recept met dezelfde naam of ID, dan wordt dat bijgewerkt. Bij een fout krijgt het bestand "FOUT - " voor de naam en staat de reden in de bestandsbeschrijving.',
  'JSON-formaat (één object of een lijst van objecten): {"naam":"…","categorie":"Avondmaaltijden","soort":"recept","beschrijving":"…","moeilijkheid":"Gemakkelijk","voorbereiding_min":15,"bereiding_min":20,"totaal_min":35,"porties":4,"portiegewicht":"ca. 400 g","tags":"Eiwitrijk, Kip","keukengerei":"Koekenpan; Snijplank","ingredienten":"600 g kipfilet\\n1 st ui","stappen":"Snijd de kip.\\nBak 8 minuten.","kcal":520,"eiwit":45,"koolhydraten":50,"suikers":6,"vet":14,"verzadigd_vet":4,"vezels":7,"zout":1.8,"voedingswaarden_basis":"per portie","extra":"## Bewaren\\nKoelkast 2-3 dagen."}',
  'Bestaande categorieën: Ontbijt, Tussendoortjes en snacks, Lunch en middageten, Avondmaaltijden, Mealprep-gerechten, Bijgerechten en salades, Desserts en zoete snacks, Marinades, Warme en koude sauzen, Gezonde en eiwitrijke sauzen, Kruidenmixen, Basisbereidingen en praktische kooktips, Bewaar-, invries- en opwarmrichtlijnen, Omrekeningstabellen en voedingsinformatie. Een nieuwe categorie mag ook: voeg ze dan ook toe in de tab Categorieën.'
];
