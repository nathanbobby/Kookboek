# Kookboek-app installeren (± 15 minuten, eenmalig)

Je hebt 3 onderdelen:

1. **De app** (deze map) → komt gratis online via GitHub Pages.
2. **De database** → de Google Sheet *Kookboek database* in de map *Kookboek* op je Google Drive (al aangemaakt, nog leeg).
3. **De koppeling** → een klein script (`apps-script/Code.gs`) in die Sheet. Het geeft de recepten aan de app en leest nieuwe recepten in uit de map *Kookboek Inbox*.

---

## Stap 1 – App op GitHub zetten

1. Maak een gratis account op https://github.com (als je er nog geen hebt).
2. Klik rechtsboven op **+ → New repository**.
   - Naam: `kookboek`
   - Zet hem op **Public**. GitHub Pages is alleen gratis voor publieke repositories. De link is moeilijk te raden, maar wie hem heeft, kan de recepten zien.
   - Klik op **Create repository**.
3. Klik op **uploading an existing file**. Pak de zip uit en sleep **de inhoud** van de map `kookboek-app` (dus `index.html`, `app.js`, de mappen `data`, `icons`, …) in het venster. Klik op **Commit changes**.
4. Ga naar **Settings → Pages**. Kies bij *Branch*: `main` en `/ (root)` en klik op **Save**.
5. Wacht 1 à 2 minuten. Je app staat dan op `https://JOUW-NAAM.github.io/kookboek/`.
   - Controleer dat `https://JOUW-NAAM.github.io/kookboek/data/recepten.json` tekst toont.

## Stap 2 – Database en koppeling klaarzetten

1. Open in Google Drive de map **Kookboek** en dan de Sheet **Kookboek database**.
2. Kies **Extensies → Apps Script**.
3. Wis alles in `Code.gs` en plak de volledige inhoud van `apps-script/Code.gs`.
4. Pas regel 14 aan: vervang `JOUW-GITHUB-NAAM` door je GitHub-naam.
5. Klik op 💾 (opslaan). Kies bovenaan de functie **installeer** en klik op **Uitvoeren**.
   - Google vraagt om toestemming. Kies je account, dan **Geavanceerd → Ga naar … (onveilig)** en **Toestaan**. Dat is normaal voor een eigen script.
6. Na ± 30 seconden staan alle recepten in de Sheet. Er zijn dan ook twee mappen bijgekomen: **Kookboek Inbox** en **Kookboek Verwerkt**.
7. Noteer de **schrijfsleutel** uit het uitvoeringslogboek. Je vindt hem later ook via het menu *Kookboek → Sleutel en mappen tonen* in de Sheet.

## Stap 3 – Web-app publiceren

1. Klik in Apps Script op **Implementeren → Nieuwe implementatie**.
2. Klik op ⚙️ en kies **Web-app**.
   - *Uitvoeren als*: **Ik**
   - *Wie heeft toegang*: **Iedereen**. De app moet zonder inloggen kunnen lezen. Schrijven kan alleen met de schrijfsleutel.
3. Klik op **Implementeren** en kopieer de **web-app-URL** (eindigt op `/exec`).
4. Open op GitHub het bestand `config.js`, klik op het potlood en plak de URL bij `dataUrl: '...'`. Klik op **Commit changes**.

> Pas je later het script aan? Ga dan naar **Implementeren → Implementaties beheren → ✏️ → Versie: Nieuwe versie**. Zo blijft de URL dezelfde.

## Stap 4 – Op je gsm en tablet installeren

1. Open `https://JOUW-NAAM.github.io/kookboek/` in **Chrome**.
2. Tik op **⋮ → Toevoegen aan startscherm / App installeren**.
3. Open de app, ga naar **Meer** en vul de **schrijfsleutel** in. Doe dit per toestel; de sleutel staat bewust niet op GitHub.
4. Open alle recepten één keer met internet. Daarna werkt alles ook offline.

---

## Dagelijks gebruik

- **Recept toevoegen vanop gsm**: kies *Meer → Nieuw recept*, of het potlood bij een recept om het te bewerken. Ben je offline? Dan wordt het verstuurd zodra je weer internet hebt.
- **In de Sheet**: pas rijen rechtstreeks aan of voeg rijen toe. De app haalt de wijzigingen op bij openen, of via *Meer → Nu synchroniseren*.
- **Via AI (Claude of een andere AI)**: laat de AI een `.json`-bestand in de map **Kookboek Inbox** zetten. Het formaat staat in de tab *Uitleg* van de Sheet. Binnen 15 minuten, of meteen als je de app opent, staat het recept in de Sheet en de app. Het bestand verhuist dan naar *Kookboek Verwerkt*.
  - Bestaat er al een recept met dezelfde naam? Dan wordt dat recept bijgewerkt. Zo kan een AI ook een bestaand recept verbeteren.
- **Boodschappen**: tik bij een recept op *Op boodschappenlijst*. De lijst telt de hoeveelheden samen per winkelafdeling.
  - Met *Heb ik altijd* verhuist iets (bv. zout, olie) naar je vaste voorraad.
  - Met *Delen* stuur je de lijst naar WhatsApp of Keep.

## Nieuwe app-versie (alleen als de app-bestanden zelf veranderen)

Upload de gewijzigde bestanden op GitHub en verhoog in `sw.js` de `VERSIE` (bv. `kookboek-v2`). De app werkt zichzelf dan bij. Voor nieuwe recepten is dit **niet** nodig: die komen uit de Sheet.
