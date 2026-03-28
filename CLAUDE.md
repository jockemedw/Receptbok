# Receptboken — Projektkontext för Claude Code

## Vad det här projektet är
Personlig matplaneringsapp för familjen (två vuxna + litet barn). Användaren väljer datum och inställningar, appen genererar matsedel + inköpslista och sparar centralt så hela familjen ser samma data på alla enheter.

## Arkitektur
```
Browser → Vercel /api/generate → Claude Haiku (receptval) → GitHub repo (JSON-filer) → Browser läser
```
- **Frontend:** `index.html` på GitHub Pages (backup) + Vercel (primär, under migration)
- **Backend:** Vercel serverless `/api/generate` — tar emot inställningar, filtrerar recept, anropar Claude Haiku, sparar JSON till GitHub
- **Data:** `recipes.json` (källa), `weekly-plan.json`, `shopping-list.json`, `recipe-history.json` — alla i repot
- **Secrets:** `ANTHROPIC_API_KEY` + `GITHUB_PAT` (contents:write) i Vercel env vars
- **Autentisering:** Ingen — familjeapp med okänd URL

## Designprinciper (följ alltid)
- **Gratis** — betallösningar kräver stark motivering
- **Ingen automatisk generering** — matsedeln triggas alltid manuellt. Familjen har litet barn och kan inte styra inköp till en fast veckodag. Föreslå aldrig cron-schema.
- **Delad data** — localStorage och device-specifika lösningar är aldrig acceptabla
- **AI bara där det behövs** — slump + filter är bättre än AI om resultatet är likvärdigt
- **Vercel är backend** — GitHub Actions används ej längre

## Kommunikation med användaren
- **Förklaringsnivå 3.5** — använd analogi + teknisk term i parentes vid behov. Nivå 1–2 för rutinändringar, 3.5 vid beslut eller felsökning.
- **Felmeddelanden** — alltid på begriplig svenska utan tekniska termer, med en handlingsorienterad uppmaning. Inte: `409 — SHA conflict`. Utan: `Kunde inte spara matsedeln — prova att generera igen.`
- Användaren är inte utvecklare. Claude Code hanterar all kod — användaren committar via GitHub Desktop.

## Deployment
- Commit + push till `main` → Vercel och GitHub Pages deployas automatiskt (~30 sek). Ingen manuell åtgärd behövs.
- `api/generate.js` → Vercel. `index.html` → GitHub Pages + Vercel. JSON-filer → syns direkt (CDN-cache ~60 sek).
- **Lokal testmiljö:** Antigravity har inbyggd live preview för `index.html` — öppna filen där för att testa UI utan att pusha. Genereringsknappen kräver Vercel-backend och kan ej testas lokalt.

## Operativa regler (följ utan att fråga)
- Använd alltid `Edit` på `index.html` — aldrig `Write` (filen är för stor, Write skriver över allt)
- Rör aldrig `recipes.json`-strukturen utan explicit instruktion
- Appen ska fungera på alla enheter. Mobilanvändning prioriteras vid designbeslut (touch-first, inga hover-states som primär interaktion)
- **Stanna och bekräfta** — om ett meddelande är feedback eller återkoppling (inte en tydlig instruktion), tolka det INTE som en order att agera. Ställ en kort fråga och invänta svar innan du gör ändringar.

## Nyckelkfunktioner i index.html (sök vid behov, rör ej strukturen)
- `init()` — startar appen, laddar recept
- `loadWeeklyPlan()` — hämtar och renderar veckoplan + inköpslista
- `generatePlan()` — hanterar genereringsknappen och API-anropet
- `renderWeeklyPlanData()` — renderar veckovyn
- `renderShoppingList()` — renderar inköpslistan
- `applyFilters()` — filtrerar receptvyn

## Hur Claude ska tänka
- Förstå den övergripande ambitionen (självgående familjeapp), inte bara den enskilda frågan
- Tänk på hela familjen som användare — inte bara den tekniska personen
- **Uppdatera CLAUDE.md efter varje större ändring**

## Repo-struktur
```
Receptbok/
├── index.html              # Frontend — Vanilla JS, Playfair Display + DM Sans
├── recipes.json            # Receptdatabasen (62 recept, rör ej strukturen)
├── weekly-plan.json        # Genereras av /api/generate
├── shopping-list.json      # Genereras av /api/generate
├── recipe-history.json     # Recepthistorik — undviker upprepning
├── api/
│   ├── generate.js         # Vercel serverless: filtrering + Claude Haiku + GitHub-skrivning
│   ├── recipes.js          # Vercel serverless: toggle_tested, update, delete mot recipes.json
│   ├── shopping.js         # Vercel serverless: inköpslisteoperationer
│   ├── confirm.js          # Vercel serverless: bekräfta matsedel
│   ├── replace-recipe.js   # Vercel serverless: byt recept i plan
│   ├── swap-days.js        # Vercel serverless: byt dagar i plan
│   └── _shared/
│       └── shopping-builder.js  # Delad inköpslistebyggare
├── vercel.json             # 60s timeout för generate.js
├── package.json            # @anthropic-ai/sdk
└── CLAUDE.md
```

## Tekniska beslut
- **Färgtema:** Krämvitt `#faf7f2`, brun header `#5c3d1e`, terrakotta `#c2522b`
- **AI för receptval:** Claude Haiku `claude-haiku-4-5-20251001` — väljer recept, respekterar regler + historik
- **Inköpslista:** Byggs deterministiskt i JS från receptdata — ingen AI
- **Recepthistorik:** `recipe-history.json` — Claude instrueras undvika recept använda senaste 28 dagar
- **Receptlistan shufflas** innan Claude ser den — ger variation varje generering
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
8. ~~**Flerval i receptfilter**~~ — **KLAR** (session 15, 2026-03-28)
9. ~~**Prövat/Oprövat-filter**~~ — **KLAR** (session 15, 2026-03-28)
10. ~~**Förbättrad receptväljare**~~ — **KLAR** (session 12, 2026-03-25)
11. **Expanderbara receptkort i veckovyn** — receptkortet ska kunna vecklas ut direkt i matsedelsvyn (inline expand), utan att lämna vyn
12. ~~**Ytterligare kvalitetskontroll av inköpslistan**~~ — **KLAR** (session 13, 2026-03-26)
13. ~~**Sortering inom inköpslistans kategorier**~~ — **KLAR** (session 13, 2026-03-26)
14. **Handplocka recept** — möjlighet att låsa in ett eller flera specifika recept från receptboken innan generering. Fritekstfältet är en mjuk önskan som tyst misslyckas om receptet är historikblockat. Handplockning kringgår historikblockering och ger full kontroll.
15. ~~**Receptredigering**~~ — **KLAR** (session 15, 2026-03-28) — toggle prövat/ej prövat direkt på kort, redigeringsmodal för alla fält, ta bort recept

## Session 15 (2026-03-28 — KLAR)
- **Punkt 8 + 9 klara:** Flerval i receptfilter — `activeFilters` (Set) ersätter `activeFilter` (sträng). OR-logik: recept visas om det matchar något av de valda filtren. Nytt filter "✗ Oprövat" (43 recept) tillagt. Filterordning: Alla → Provat → Oprövat → Fisk → Kyckling → Vegetarisk → Kött → Fläsk → Snabb → Soppa → Pasta.
- **Punkt 15 klar:** Receptredigering — ny `api/recipes.js` med actions `toggle_tested`, `update`, `delete`. Prövat/ej provat-pill klickbar direkt på receptkortet. Redigeringsmodal med alla fält. Ta bort-knapp med bekräftelse. DOM uppdateras utan sidladdning.
- **Veckomatsedel redesign:** Genereringsformuläret fälls ihop automatiskt när plan finns (visas som "＋ Ny plan"). Bekräfta-knappen flyttad ovanför receptdetaljpanelen. Proteinindikator (färgad vänsterkant) på dag-korten. Metadatarad visar bara datumspann. Emojis borttagna ur sektionsrubriker.
- **Bugfixar:** jumpToRecipe använde gammal filtervariabel. saveBtn fastnade i disabled-läge. scroll till receptdetalj i veckovyn landade fel (isSnapping sattes inte → header-hide förskjöt sidan).
- **Tekniska beslut:** Recepthistorik använder 14-dagarsfönster, format `{ usedOn: { "id": "datum" } }`. `activeFilters` är en Set, inte en sträng.
- **Nästa session börjar med:** Punkt 11 (expanderbara receptkort i veckovyn) eller punkt 14 (handplocka recept).

## Senaste session (2026-03-14 — Session 8)
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
