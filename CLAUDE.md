# Receptboken — Projektkontext för Claude Code

## Vad det här projektet är
Personlig matplaneringsapp för familjen (två vuxna + litet barn). Användaren väljer datum och inställningar, appen genererar matsedel + inköpslista och sparar centralt så hela familjen ser samma data på alla enheter.

## Arkitektur
```
Browser → Vercel /api/generate → Deterministisk receptväljare (JS) → GitHub repo (JSON-filer) → Browser läser
```
- **Frontend:** `index.html` på GitHub Pages (backup) + Vercel (primär)
- **Backend:** Vercel serverless `/api/generate` — tar emot inställningar, filtrerar recept, väljer deterministiskt, sparar JSON till GitHub
- **Data:** `recipes.json` (källa), `weekly-plan.json`, `shopping-list.json`, `recipe-history.json` — alla i repot
- **Secrets:** `GITHUB_PAT` (contents:write) i Vercel env vars
- **Autentisering:** Ingen — familjeapp med okänd URL
- **AI-kostnad vid import** — receptimport via foto och URL-fallback använder Google Gemini API (gratistier). Receptval är fortfarande kostnadsfritt och deterministiskt.

## Designprinciper (följ alltid)
- **Gratis** — betallösningar kräver stark motivering
- **Ingen automatisk generering** — matsedeln triggas alltid manuellt. Familjen har litet barn och kan inte styra inköp till en fast veckodag. Föreslå aldrig cron-schema.
- **Delad data** — localStorage och device-specifika lösningar är aldrig acceptabla
- **Ingen AI i runtime** — receptval sker deterministiskt (filter + slump + proteinbalans). AI (Claude Code) används bara vid utveckling
- **Vercel är backend** — GitHub Actions används ej längre

## Kommunikation med användaren
- **Förklaringsnivå 3.5** — använd analogi + teknisk term i parentes vid behov. Nivå 1–2 för rutinändringar, 3.5 vid beslut eller felsökning.
- **Felmeddelanden** — alltid på begriplig svenska utan tekniska termer, med en handlingsorienterad uppmaning. Inte: `409 — SHA conflict`. Utan: `Kunde inte spara matsedeln — prova att generera igen.`
- Claude pushar direkt till `main` efter varje ändring — användaren behöver inte använda GitHub Desktop.

## Deployment
- Commit + push till `main` → Vercel och GitHub Pages deployas automatiskt (~30 sek). Ingen manuell åtgärd behövs.
- `api/generate.js` → Vercel. `index.html` → GitHub Pages + Vercel. JSON-filer → syns direkt (CDN-cache ~60 sek).
- **Lokal testmiljö:** Antigravity har inbyggd live preview för `index.html` — öppna filen där för att testa UI utan att pusha. Genereringsknappen kräver Vercel-backend och kan ej testas lokalt.

## Operativa regler (följ utan att fråga)
- `index.html` är nu 290 rader (bara HTML-markup). `Edit` eller `Write` fungerar båda, men `Edit` föredras.
- Frontend-JS ligger i `js/`-moduler — redigera rätt modulfil, inte index.html
- Rör aldrig `recipes.json`-strukturen utan explicit instruktion
- Appen ska fungera på alla enheter. Mobilanvändning prioriteras vid designbeslut (touch-first, inga hover-states som primär interaktion)
- **Stanna och bekräfta** — om ett meddelande är feedback eller återkoppling (inte en tydlig instruktion), tolka det INTE som en order att agera. Ställ en kort fråga och invänta svar innan du gör ändringar.

## Definition of Done (följ alltid)
Innan "klart" deklareras ska Claude alltid:
1. Läsa tillbaka den editerade filen och verifiera att ändringen landade rätt (Edit-hooken fångar syntaxfel automatiskt)
2. Kontrollera att relaterade funktioner inte brutits — Grep efter berörda funktionsnamn om tveksamt
3. Committa och pusha till `main`
4. Uppdatera "Senaste session"-sektionen i CLAUDE.md

## Frontend-moduler (VSA)
Varje feature-slice är en fristående JS-fil. En agent som jobbar med en feature behöver bara läsa 1–2 filer.
- `js/app.js` — entry point, importerar alla moduler, kör `init()` + `loadWeeklyPlan()`
- `js/state.js` — alla globala `window.*`-variabler som delas mellan moduler
- `js/utils.js` — delade hjälpfunktioner (`proteinLabel`, `timeStr`, `renderIngredient`, `fmtIso`, `fmtShort`)
- `js/ui/scroll.js` — scroll-logik, header show/hide, smoothScrollTo
- `js/ui/navigation.js` — `switchTab()`
- `js/shopping/shopping-list.js` — hela inköpsliste-slicen
- `js/weekly-plan/ingredient-preview.js` — ingrediens-förhandsgranskning i veckovyn
- `js/weekly-plan/plan-generator.js` — datumväljare, inställningar, generering
- `js/weekly-plan/plan-viewer.js` — veckoplan, swap, replace, confirm
- `js/recipes/recipe-browser.js` — receptlistning, filtrering, sökning
- `js/recipes/recipe-editor.js` — redigera/spara/ta bort recept
- `js/recipes/recipe-import.js` — import via URL och foto

### Cross-modul-anrop
Funktioner exponeras via `window.*` i varje modul. Moduler anropar varandra via `window.funktionsNamn()` — inga cirkulära ES6-imports.

### Backend-moduler (VSA)
Delad infrastruktur i `api/_shared/`:
- `constants.js` — REPO_OWNER, REPO_NAME, BRANCH
- `github.js` — `readFile()`, `readFileRaw()`, `writeFile()` (3-retry SHA-hantering)
- `handler.js` — `createHandler()` (CORS, auth, error-wrapping)

Domänlogik stannar i respektive endpoint-fil (`api/generate.js`, `api/shopping.js`, etc.).

## Hur Claude ska tänka
- Förstå den övergripande ambitionen (självgående familjeapp), inte bara den enskilda frågan
- Tänk på hela familjen som användare — inte bara den tekniska personen
- **Uppdatera CLAUDE.md efter varje större ändring**

## Repo-struktur
```
Receptbok/
├── index.html              # HTML-markup (290 rader) — laddar js/app.js som ES-modul
├── css/
│   └── styles.css          # All CSS (1620 rader, extraherad från index.html)
├── js/
│   ├── app.js              # Entry point — importerar alla moduler
│   ├── state.js            # Globala variabler (delas mellan moduler)
│   ├── utils.js            # Delade hjälpfunktioner
│   ├── ui/
│   │   ├── scroll.js       # Scroll, header, smoothScrollTo
│   │   └── navigation.js   # switchTab()
│   ├── shopping/
│   │   └── shopping-list.js # Inköpsliste-slice
│   ├── weekly-plan/
│   │   ├── plan-generator.js  # Generering + inställningar
│   │   ├── plan-viewer.js     # Veckoplan + swap/replace/confirm
│   │   └── ingredient-preview.js
│   └── recipes/
│       ├── recipe-browser.js  # Listning, filter, sökning
│       ├── recipe-editor.js   # Redigera/spara/ta bort
│       └── recipe-import.js   # Import via URL/foto
├── api/
│   ├── _shared/
│   │   ├── constants.js    # REPO_OWNER, REPO_NAME, BRANCH
│   │   ├── github.js       # readFile, readFileRaw, writeFile
│   │   └── handler.js      # createHandler (CORS, auth, errors)
│   ├── generate.js         # Receptval + matsedel + inköpslista
│   ├── replace-recipe.js   # Byt enskilt recept
│   ├── swap-days.js        # Byt plats på två dagar
│   ├── confirm.js          # Bekräfta matsedel
│   ├── recipes.js          # CRUD recept
│   ├── shopping.js         # Inköpsliste-API
│   └── import-recipe.js    # Receptimport (Gemini)
├── recipes.json            # Receptdatabasen (62 recept, rör ej strukturen)
├── weekly-plan.json        # Genereras av /api/generate
├── shopping-list.json      # Genereras av /api/generate
├── recipe-history.json     # Recepthistorik — undviker upprepning
├── vercel.json             # 15s timeout
├── package.json            # Inga runtime-beroenden
└── CLAUDE.md
```

## Tekniska beslut
- **Färgtema:** Krämvitt `#faf7f2`, brun header `#5c3d1e`, terrakotta `#c2522b`
- **Receptval:** Deterministisk JS-algoritm i `selectRecipes()` — historikfiltrering (14 dagar) → proteinfördelning (max 2 per typ) → vardag30/helg60-matchning → slump. Ingen AI.
- **Inköpslista:** Byggs deterministiskt i JS från receptdata — ingen AI
- **Recepthistorik:** `recipe-history.json` — recept använda senaste 14 dagar filtreras bort, äldsta fylls på vid behov
- **Inställningar:** Oprövade (direkt siffra), vegetariska dagar (direkt siffra), proteintoggle med receptantal. Ingen skalning, inga tidsväljare, inget fritextfält.
- **Willys-integration:** Avaktiverad — EU-scraping-blockering (400-fel), ingen plan

## recipes.json — struktur (rör ej)
```json
{
  "meta": { "version": "1.0", "lastUpdated": "2026-03-08", "totalRecipes": 62 },
  "recipes": [{
    "id": 1, "title": "Receptnamn", "tested": false, "servings": 4,
    "time": 40, "timeNote": "ugn 150°",
    "tags": ["helg60", "fisk", "ugn"],
    "protein": "fisk",
    "ingredients": ["600 g torsk", "..."],
    "instructions": ["Steg 1...", "Steg 2..."],
    "notes": "Tips: ..."
  }]
}
```
**Protein:** `fisk` | `kyckling` | `kött` | `fläsk` | `vegetarisk`
**Taggar:** `vardag30` (≤30 min vardag), `helg60` (≤60 min helg), `soppa/pasta/wok/ugn/sallad/gryta/ramen` (typ), `veg` (vegetariskt)

## Dataformat — genererade filer
```json
// weekly-plan.json
{ "generated": "2026-03-14", "startDate": "...", "endDate": "...",
  "days": [{ "date": "2026-03-14", "day": "Fredag", "recipe": "Titel", "recipeId": 23 }] }

// shopping-list.json
{ "generated": "2026-03-14", "categories": {
    "Mejeri": ["2 dl grädde"], "Grönsaker": ["1 purjolök"],
    "Fisk & kött": ["600 g torsk"], "Frukt": [], "Skafferi": [], "Övrigt": [] }}

// recipe-history.json
{ "history": [{ "date": "2026-03-14", "recipeIds": [47, 62, 51] }] }
```

## Nästa steg (prioritetsordning)
1. ~~**Migrera till Vercel-URL**~~ — **KLAR** (session 10, 2026-03-23)
2. ~~**Inköpslistan**~~ — **KLAR** (session 10, 2026-03-23)
3. ~~**Standardvärden**~~ — **KLAR** (session 9)
4. ~~**Matlagningsläge**~~ — **KLAR** (session 10, 2026-03-23)
5. **Receptimport** — klistra in URL, hämta/tolka/översätt till `recipes.json`-format
6. ~~**Inköpsliste-ombyggnad**~~ — **KLAR** (session 12, 2026-03-25)
7. ~~**Portionsanpassning**~~ — **KLAR** (session 12, 2026-03-25)
8. ~~**Flerval i receptfilter**~~ — **KLAR** (session 16, avbruten)
9. ~~**Prövat/Oprövat-filter**~~ — **KLAR** (session 16, avbruten)
10. ~~**Förbättrad receptväljare**~~ — **KLAR** (session 12, 2026-03-25)
11. ~~**Expanderbara receptkort i veckovyn**~~ — **KLAR** (session 16, avbruten)
12. ~~**Ytterligare kvalitetskontroll av inköpslistan**~~ — **KLAR** (session 13, 2026-03-26)
13. ~~**Sortering inom inköpslistans kategorier**~~ — **KLAR** (session 13, 2026-03-26)
14. ~~**Handplocka recept**~~ — **KLAR** (session 17, 2026-03-30)
15. ~~**Receptimport via URL och foto**~~ — **KLAR** (session 18, 2026-04-01)
16. ~~**VSA-refaktorering**~~ — **KLAR** (session 21, 2026-04-06)

### Buggar (tillagda session 20, 2026-04-06)
- ~~**[BUGG] Inköpslista-bockningar synkas inte**~~ — **FIXAD**
- ~~**[BUGG] Bockningar försvinner vid flikbyte**~~ — **FIXAD**
- **[BUGG] Slumpa nytt recept ignorerar regler** — När ett enskilt recept i matsedeln ersätts via "slumpa nytt" tillämpas inte samma regler som vid initial generering (historikfiltrering, proteinbalans, vardag/helg-tagg, veg-dagar).

### Nya features (tillagda session 20, 2026-04-06)
- **[FEATURE] Blockera dagar i matsedeln** — Möjlighet att markera en eller flera dagar som "ledig" (AW, äter ute, etc.) innan eller efter generering. Blockerade dagar får inget recept och räknas inte in i inköpslistan.
- **[FEATURE] Dynamiska tagggrupper i receptfilter** — Filterknapparna i receptboken byggs automatiskt från taggarna som faktiskt finns i `recipes.json` (inga hårdkodade knappar). Taggarna grupperas i kategorier: **Tillagningstid** (`vardag30`, `helg60`), **Recepttyp** (`soppa`, `pasta`, `wok`, `ugn`, `sallad`, `gryta`, `ramen`, m.fl.), och i framtiden **Kök** (t.ex. `italienskt`, `asiatiskt`) när sådana taggar läggs till i receptdatabasen. Varje grupp får en rubrik. Okategoriserade taggar hamnar i en "Övrigt"-grupp.

## Senaste session — Session 22 (2026-04-09)
- **ContextBridge struken** — borttagen ur backlog och alla kommentarer i `js/state.js` och CLAUDE.md. `window.*`-mönstret behålls som det är.

## Session 21 (2026-04-06 — KLAR)
- **VSA-refaktorering genomförd** i tre faser:
  - **Fas 1 — Backend:** Delad infrastruktur extraherad till `api/_shared/` (`constants.js`, `github.js`, `handler.js`). 7 endpoints refaktorerade, ~266 rader duplicerad kod borttagna.
  - **Fas 2 — CSS:** `css/styles.css` skapad (1620 rader). `<style>`-block i index.html ersatt med `<link>`.
  - **Fas 3 — Frontend JS:** 11 feature-moduler skapade under `js/`. Entry point `js/app.js` med ES-modulimport. `index.html` reducerad från 3305 → 290 rader.
- **Designbeslut:** Cross-modul-anrop via `window.*` (inga cirkulära ES6-imports). Domänlogik stannar i varje slice — delar bara teknisk infrastruktur. Optimerat för att agenter ska kunna jobba med en feature genom att läsa 1–2 filer.
- **Nästa session:** Testa VSA-ändringarna live.

## Session 19 (2026-04-02 — PÅGÅENDE)
- **Fotoimport-felsökning:** Gemini-modellnamnet har behövt justeras flera gånger — `gemini-2.0-flash` (quota 0 på free tier) → `gemini-1.5-flash` (not found, pensionerad) → `gemini-2.5-flash` via `v1beta` (nuvarande gratisflash-modell)
- **FAB-position:** Plusknappen flyttad till vänster sida så den inte lappar över scroll-to-top-pilen (höger)
- **Kodgranskning klar (session 20, 2026-04-06):** Branch mergad. `api/import-recipe.js` verifierad — rätt modell (`gemini-2.5-flash`), rätt endpoint (`v1beta`), korrekt request-format för både foto och URL-fallback.
- **Återstår:** Funktionstest i live-appen — kräver att `GOOGLE_API_KEY` finns i Vercel env vars. Prova importera ett recept via foto eller URL.

## Session 18 (2026-04-01 — KLAR)
- **Receptimport via URL:** Ny endpoint `api/import-recipe.js` — server-side fetch → JSON-LD-parsning (schema.org/Recipe) som primär strategi. Om JSON-LD saknas och GOOGLE_API_KEY finns → Gemini-fallback (rensar HTML, skickar till Gemini). Mappar ISO 8601-duration, gissar protein, bygger taggar.
- **Receptimport via foto:** Samma endpoint — base64-bild skickas till Gemini 2.0 Flash Vision med strikt JSON-prompt (returnerar exakt receptschemat). Bilden krympas i webbläsaren (max 1200px, JPEG quality 0.7) för att undvika Vercels 4.5 MB-gräns.
- **Ny `add`-action i `api/recipes.js`:** Genererar ID (max+1), sparar till `recipes.json` via befintlig SHA-retry.
- **UI:** "＋ Importera recept"-knapp i receptvyn → import-modal med URL/Foto-flikar. Foto-flödet visar progressiva meddelanden (Analyserar bild… → Identifierar ingredienser… → Formaterar recept…). Importerat recept öppnar redigera-modalen med titeln "Nytt recept" för granskning innan sparning.
- **Kräver av användaren:** `GOOGLE_API_KEY` i Vercel env vars (gratis från aistudio.google.com). URL-import med JSON-LD fungerar utan nyckeln.
- **Planprocess:** Plan granskad av GPT och Gemini — Gemini-fallback för URL och JPEG-komprimering lades till baserat på feedback.

## Session 8 (2026-03-14)
- Stängde av Antigravity som todo-punkt — användaren pushar och refreshar, inget lokalt behov
- Lade till "Stanna och bekräfta"-regel i Operativa regler — agera ej på feedback utan att fråga först
- To-do-listan fastställd, inga kodfixar gjorda

## Session 9 (2026-03-16)
- **Punkt 3 klar:** Standardvärden satta — untestedCount 0→1, vegetarianDays 0→4. Skalning sker proportionellt vid generering (Math.round(dagar/7 × värde)), displayvärdena ändras aldrig.
- **Punkt 10 påbörjad men pausad:** Djupanalys av hela repot genomförd. Tre konkreta problem identifierade i receptvalet (se nedan). Avvaktar svar från användaren om vad som upplevs som fel i praktiken — innan någon implementation påbörjas.

### Punkt 10 — öppen fråga till nästa session
Tre problem hittade i `callClaude()` / receptvalet:
1. **Ingen validering av returdata** — Claude kan hallucinera recept-ID:n, returdata kollas knappt
2. **Motstridiga regler** — "helg60 MÅSTE användas" vs "samma protein max 2 ggr" krockar vid smal databas (t.ex. bara fisk + flera helgdagar)
3. **Databas-bias är dold** — 66% vegetariska recept, Claude vet inte om det sneda urvalet

**Fråga att ställa användaren:** Vad har gått snett i praktiken — finns det matsedlar som blivit dåliga, och i så fall varför?

**Nästa session börjar med:** Få svar på ovanstående fråga, sedan besluta om punkt 10 ska vara bugfix, agentic refactor, eller något annat.

## Session 10 (2026-03-23)
- **Punkt 1 klar:** Hårdkodade Vercel-URL:er (`https://receptbok-six.vercel.app/api/...`) bytta mot relativa sökvägar (`/api/...`) i index.html. CORS var redan `*` i båda endpoints.
- **Punkt 2 klar:** Inköpslistebyggaren omskriven med 5-stegspipeline
- **Punkt 4 klar:** Matlagningsläge — instruktionssteg är klickbara/tappbara (grön bock + genomstrykning). Header auto-hides vid nedscroll, visas vid uppscroll (position fixed + transform translateY + ResizeObserver för padding-top). Card-snap med smoothScrollTo (ease-in-out, 420ms), isSnapping-flagga förhindrar jojo-effekt. Flikar högerorienterade på PC (≥600px). Receptboken är nu startsida. Ingredienslista i veckovyn är kollapsbar (default minimerad, expanderas vid generering). i `api/generate.js`. Ersätter exakt textsträngsmatching med: Clean → Parse (regex, bråk, intervall) → Normalize (~150 varianter → kanoniska namn, byggd från 500+ svenska ingredienssträngar) → Merge (summerar mängder per ingrediens+enhet) → Categorize (utökade nyckelord inkl. ägg, bönor, linser, rödbetor, örter). Täckning ~90-95%.

## Session 11 (2026-03-24 — pågående)
- **Inköpsliste-fix:** Nytt steg 4.5 i pipeline (api/generate.js) — filtrera + konvertera innan kategorisering:
  - **Basvaror bort helt:** salt, svartpeppar, vitpeppar, vatten, "salt & peppar" tas bort från listan
  - **Småenheter → bara namn:** tsk/msk/krm/nypa/tumme-poster visas utan mängd (t.ex. "1 msk sambal oelek" → "sambal oelek"). Om samma ingrediens finns med stor enhet (dl/g/kg) behålls bara den stora.
  - **"tumme" tillagd som enhet:** "1 tumme ingefära" parsas nu korrekt
  - **Tillagningsbeskrivningar stripas:** "nykokt ris" → "ris", "rostade nötter" → "nötter"
  - **Normalisering utökad:** "hackade nötter", "rostade nötter/frön" → "nötter"
  - **Designprincip:** Visa allt utom det absolut självklara — användaren lägger 1 minut på att radera det hen redan har hemma
- **Ytterligare parsningsfixar (session 11, senare):**
  - `stor`/`liten vitlöksklyfta` → slås nu ihop korrekt
  - `kycklingfiléer` normaliseras → rätt kategori
  - `fiskbuljong`/`fisksås`/`ostronsås` → SKAFFERI_OVERRIDE
  - `till X`-suffix stripas (till stekning, till redning)
  - Smart eller-hantering: adjektiv/bindestreck hanteras
  - `kokt/kokta` stripas från namn efter enhet
  - UNIT_REGEX: `\b` → lookahead för svenska tecken (fixar `lök` → `½ l ök`)
  - `"fil"` borttaget från Mejeri-nyckelord (fixar `kycklingfilé` i Mejeri)
  - `+`-suffix stripas (majsstärkelse + 2 msk vatten)
- **Nästa session börjar med:** Punkt 12 — ny kvalitetskontroll efter att användaren genererat en ny matsedel

## Session 12 (2026-03-25 — KLAR)
- **Punkt 7 klar:** Alla 62 recept nu 4 portioner. 17 tvåportionsrecept dubblerade, 1 sexportionsrecept (ID 6) skalat till ⅔. Engångsskript (Node.js) + manuella korrigeringar för avrundningar, pluralformer och parentetiska vikter. Verifierat via Playwright: 62 receptkort renderas, inga "2 portioner"/"6 portioner" kvar i UI.
- **Punkt 10 klar:** Receptvalet förbättrat i `api/generate.js` — fyra ändringar: (1) nyligen använda recept filtreras *hårt* ur poolen (löser identiska matsedlar), (2) proteinfördelning skickas med i prompten, (3) valideringslogik kontrollerar returnerade ID:n och korrigerar automatiskt, (4) retry upp till 3 ggr med felåterkoppling.
- **Buggfix:** "Flytta till inköpslista"-knappen låg inuti kollapsad sektion — nu alltid synlig.
- **Buggfix:** Confirm-dialog vid "Flytta till inköpslista" borttagen — ett tryck räcker nu.
- **Ny funktion:** "Rensa lista"-knapp längst ned i inköpslistan — tömmer receptvaror, manuella varor och bockningar. Ny `clear`-action i `api/shopping.js`.
- **Backlog:** Punkt 13 tillagd — sortering inom inköpslistans kategorier.
- **Nästa session börjar med:** Punkt 12 — kvalitetskontroll av inköpslistan (generera ny matsedel och granska).

## Session 13 (2026-03-26 — KLAR)
- **Punkt 12 klar:** Kvalitetsgranskning mot 15 recept. Rotorsaker identifierade och åtgärdade i `api/generate.js`: (1) kycklingfilé i Mejeri — "rostad" innehåller "ost" som substring, fixat i `categorize()`. (2) Cashewnötter duplicerades — "hackade cashewnötter" normaliseras nu till "cashewnötter". (3) Citroner delades upp — "Skal och saft av" strippas i `cleanIngredient()`. (4) Kryddor i Grönsaker — torkad/malen-prefix → alltid Skafferi; tomatpuré/chiliflakes/paprikapulver till SKAFFERI_OVERRIDE; ingefära borttagen ur Grönsaker-nyckelord. (5) Basvaror kvar — "salt och peppar", "lite vatten", "valfria grönsaker" till PANTRY_ALWAYS_SKIP. (6) "oregano eller basilika" filtreras via " eller "-check i noAmount.
- **Punkt 13 klar:** Alfabetisk sortering (A–Ö) inom varje kategori. å/ä/ö sorteras sist via explicit teckenmappning (localeCompare med sv-locale är opålitligt i Vercels serverless-miljö).
- **Format:** Inköpslistan visar nu "ingrediensnamn (mängd)" istället för "mängd ingrediensnamn" — bättre läsbarhet och naturligare med alfabetisk sortering.
- **Nästa session börjar med:** Punkt 8, 9 eller 11 — flerval i filter, prövat/oprövat-filter, eller expanderbara receptkort.

## Session 14 (2026-03-26 — KLAR)
- **Historikspårning ombyggd:** Rotorsaker till receptupprepning (rödbetsrisotto 12×): (1) fetchHistory läste från CDN-cachad raw-URL — täta genereringar skrev ovanpå gammal data och tappade mellanliggande körningar. (2) Generationsbaserat format tappade individuell receptspårning. (3) 28-dagarsfönster blockerade ~45 av 62 recept → för snäv pool.
- **Ny design:** `fetchHistory(pat)` läser nu via GitHub API (ingen CDN-cache). Nytt format: `{ usedOn: { "5": "2026-03-26" } }` — ett datum per recept, max lika många poster som receptdatabasen har. 14-dagarsfönster. `recipe-history.json` migrerad.
- **Fallback:** När färska recept inte räcker fylls poolen med de recept som gick *längst sedan* (sorterat på datum), aldrig slumpmässigt.
- **Punkt 14 tillagd:** Handplocka recept — fritekstfältet är mjuk önskan som tyst misslyckas om receptet är historikblockat.
- **Nästa session börjar med:** Punkt 8, 9, 11 eller 14 — flerval i filter, prövat/oprövat, expanderbara receptkort, eller handplockning.

## Session 15 (2026-03-28)
- **AI borttagen från receptval:** `callClaude()` ersatt med deterministisk `selectRecipes()` i `api/generate.js`. Ingen Anthropic API-kostnad längre. Algoritm: historikfiltrering (14 dagar) → pool-uppdelning vardag/helg → veg-dagar slumpas → proteinbalans (max 2 per typ) → oprövade-kvot → slump inom varje slot. Fallback om pool är för liten.
- **Anthropic SDK borttagen:** `@anthropic-ai/sdk` borttagen ur `package.json`. `ANTHROPIC_API_KEY` behövs ej längre i Vercel env vars.
- **Inställningar förenklat:** Fritekstfält ("Önskemål") borttaget — styrde AI-prompten, irrelevant utan AI. Tidsväljare (max tid vardag/helg) borttagna — filtrering sker på taggar (vardag30/helg60), inte minuter. Oprövade och vegetariska dagar: direkt siffra istället för per-vecka-skalning.
- **Realtids-feedback:** "X recept matchar dina filter" visas i inställningspanelen. Proteinknappar visar receptantal per typ. Veg-dagar-max anpassas automatiskt till datumintervallet.
- **Vercel timeout:** Sänkt från 60s till 15s (ingen AI-väntan).
- **Claude Code hooks:** Tre hooks tillagda i `.claude/settings.json`: (1) recipes.json-skydd (PreToolUse-block), (2) Windows-notifikation vid väntan (Notification), (3) commit-påminnelse vid osparade ändringar (Stop-prompt).
- **Nästa session börjar med:** Punkt 8, 9, 11 eller 14.

## Session 16 (avbruten)
- **Punkt 8 klar:** Flerval i receptfilter — `activeFilters` är en Set, knappar togglars individuellt.
- **Punkt 9 klar:** Prövat/Oprövat som valbara filter.
- **Punkt 11 klar:** Expanderbara receptkort i veckovyn — `.week-recipe-detail` med `open`-klass och max-height-transition.

## Session 17 (2026-03-30)
- **Förbättrat arbetsflöde:** Claude pushar direkt till `main`. PostToolUse-hook kör `node --check` vid JS-edits. Definition of Done inbakad i CLAUDE.md.
- **Punkt 14 klar:** Handplocka recept — "Lås in"-knapp på varje receptkort. Låsta recept visas som chips i inställningspanelen. `selectRecipes()` placerar dem i lämpliga slots (helg60 → helgdag) och kringgår historikblockering. Veg-dag-logiken tillämpas bara på kvarvarande slots.
- **Backlog tömd** — alla planerade punkter klara.
