# Receptboken — Projektkontext för Claude Code

## Vad det här projektet är
Personlig matplaneringsapp för familjen (två vuxna + litet barn). Användaren väljer datum och inställningar, appen genererar matsedel + inköpslista och sparar centralt så hela familjen ser samma data på alla enheter.

## Arkitektur
```
Browser → Vercel /api/generate → Deterministisk receptväljare (JS) → GitHub repo (JSON-filer) → Browser läser
```
- **Frontend:** `index.html` på GitHub Pages (backup) + Vercel (primär)
- **Backend:** Vercel serverless `/api/generate` — tar emot inställningar, filtrerar recept, väljer deterministiskt, sparar JSON till GitHub
- **Data:** `recipes.json` (källa), `weekly-plan.json`, `shopping-list.json`, `recipe-history.json`, `plan-archive.json`, `custom-days.json` — alla i repot
- **Secrets:** `GITHUB_PAT` (contents:write) i Vercel env vars
- **Autentisering:** Lösenordsbaserad via Supabase Auth. Ny registrering avstängd — nya familjemedlemmar läggs till manuellt i `household_members` + Supabase-dashboarden
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
- **Verifiering:** Användaren har ingen lokal testmiljö — verifierar UI-ändringar på mobil mot live Vercel-deploy. Push till main, vänta ~30 sek, öppna `https://receptbok-six.vercel.app/` på telefonen.

## Operativa regler (följ utan att fråga)
- Frontend-JS ligger i `js/`-moduler — redigera rätt modulfil, inte `index.html` (som bara är HTML-markup, ~290 rader)
- Rör aldrig recept-strukturen (Supabase `recipes`, fält i `js/data-mapper.js`) utan explicit instruktion. `recipes.json` är retirerad (Fas 8.4)
- Appen ska fungera på alla enheter. Mobilanvändning prioriteras vid designbeslut (touch-first, inga hover-states som primär interaktion)
- **Mergea till main** — efter varje push, mergea feature-branchen till `main` och pusha. Skippa bara om användaren explicit ber om det.
- **Stanna och bekräfta** — om ett meddelande är feedback eller återkoppling (inte en tydlig instruktion), tolka det INTE som en order att agera. Ställ en kort fråga och invänta svar innan du gör ändringar.
- **Befintlig veckoplan får aldrig förstöras** som sidoeffekt av kod-ändringar (hård regel från Session 23)

## Status & dashboard (rörlig — bor i `docs/status.md`)
Den rörliga statusen (roadmap, kända buggar, live-verifieringskö, öppna utredningar, senaste session)
ligger **inte** här längre — den bor i `docs/status.md` så att den här filen bara håller stabil kontext
och inte belastar varje session. SessionStart-hooken visar en kort **digest** (mellan `<!-- DIGEST:START/END -->`
i `docs/status.md`) + git-status överst. Läs hela `docs/status.md` när du behöver detaljerna; arkiv i `docs/session-log-archive.md`.

## Kommandon (tester & skript)
Inga npm-scripts — allt körs direkt med `node` (inga externa deps utom de tester som kräver `node_modules`).

```bash
# Hela testsviten (assertion-tal från Session 82)
node tests/match.test.js            # 103 — Willys-matcher + ingrediens-normalizer
node tests/match-corpus.test.js     # 35  — accept/reject-korpus
node tests/shopping.test.js         # 81  — inköpslista (clean→parse→merge→categorize)
node tests/select-recipes.test.js   # 432 — deterministiskt receptval
node tests/data-mapper.test.js      # 27  — recipeFromRow/recipeToRow
node tests/dispatch-to-willys.test.js  # 93 — kräver node_modules
node tests/cookies-endpoint.test.js    # 29 — kräver node_modules

node --check js/app.js              # syntaxkoll (PostToolUse-hooken gör detta auto vid Edit av js/)

# Dev-skript (läser live Supabase via REST, beroendefria)
node scripts/export-recipes.mjs     # synka gitignorerad cache scripts/.cache/recipes.json
node scripts/audit-ingredients.mjs  # gradera ingrediensavvikelser (P0/P1/P2)
```
Hooks i `.claude/settings.json` kör relevanta tester automatiskt vid Edit och blockerar vid fail — men kör hela sviten manuellt efter ändringar som rör flera moduler.

## Definition of Done (följ alltid)
Innan "klart" deklareras ska Claude alltid:
1. Läsa tillbaka den editerade filen och verifiera att ändringen landade rätt (Edit-hooken fångar syntaxfel automatiskt)
2. Kontrollera att relaterade funktioner inte brutits — Grep efter berörda funktionsnamn om tveksamt
3. Committa och pusha till `main`
4. Uppdatera `docs/status.md` (senaste session, buggar, roadmap, verifieringskö) — **och** dess `<!-- DIGEST:START/END -->`-block överst om det öppna läget ändrats. CLAUDE.md rörs bara om den *stabila* kontexten ändrats.
5. **Arkivera föregående session:** innan ny "Senaste session"-ruta skrivs i `docs/status.md`, flytta den nuvarande till toppen av `docs/session-log-archive.md`. `docs/status.md` håller bara *en* sessionsruta. Lyft oavslutade "kvar att fixa"-punkter till *Kända buggar* / *Väntar på live-verifiering* / *Öppna utredningar* i `docs/status.md` innan arkivering — öppet arbete ska synas i de strukturerade sektionerna, inte begravas i prosa.

## Modulstruktur (VSA)
Varje feature-slice är en fristående fil — en agent som jobbar med en feature behöver bara läsa 1–2 filer. Se katalogerna live via `ls js/` och `ls api/` (strukturen är självdokumenterande).

- **Frontend** (`js/`): `app.js` (entry), `state.js` (delade `window.*`-vars), `utils.js` (delade hjälpare), `ui/` (scroll, navigation), `shopping/`, `weekly-plan/` (generator, viewer, ingredient-preview), `recipes/` (browser, editor, import).
- **Backend** (`api/`): Endpoints som egna filer. Delad infrastruktur i `api/_shared/` (`constants.js`, `github.js` med 3-retry SHA-hantering, `handler.js` med CORS+auth+error-wrapping, `history.js`, `shopping-builder.js`, `willys-matcher.js`).
- **Cross-modul-anrop:** Funktioner exponeras via `window.*`. Moduler anropar varandra via `window.funktionsNamn()` — inga cirkulära ES6-imports. Domänlogik stannar i varje slice; bara teknisk infrastruktur delas.

## Tekniska beslut
- **Färgtema:** Linen-canvas `#f5f1e8`, lichen-grön header `#7a9482`, rust-accent `#b56a4c` (CTA + today). Forest `#3d5544` text, ochre `#c89a3e` wordmark-suffix, lichen-deep `#5e7a68` success/savings. Scandi/nature-paletten — designad i Claude Design, migrerad i Session 43.
- **Receptval:** Deterministisk JS-algoritm i `selectRecipes()` — historikfiltrering (14 dagar) → proteinfördelning (max 2 per typ) → vardag30/helg60-matchning → slump. Ingen AI.
- **Inköpslista:** Byggs deterministiskt i JS från receptdata — ingen AI. Pipeline: Clean → Parse → Normalize → Merge → Categorize. Sortering A–Ö per kategori, format `"ingrediensnamn (mängd)"`.
- **Recepthistorik:** `recipe-history.json` format `{ usedOn: { "5": "2026-03-26" } }` — ett datum per recept, läses via GitHub API (ej CDN-cache). 14-dagarsfönster. Fallback sorterad på "längst sedan".
- **Inställningar:** Oprövade (direkt siffra), vegetariska dagar (direkt siffra), proteintoggle med receptantal. Ingen skalning, inga tidsväljare, inget fritextfält.
- **Prisoptimering (opt-in toggle):** `optimize_prices`-flag → hämtar Willys-erbjudanden → `bucketBySaving()` sorterar rea-recept först i poolen. Tröskeln (≥10) mäts på **värdeviktad** besparing (`weightedSaving()`), inte rå kr: varje sparad krona viktas efter erbjudandets ordinarie pris (dyrt väger tungt, billig vitlök/lök väger lätt) + protein-boost — så menyn styrs av dyra protein-/färskvarureor, inte vanliga billiga stapelvaror. Visad kr-besparing ändras INTE, bara prioriteringen. Filter (historik/veg/protein/låsta/blockerade) respekteras fullt.
- **"Veckans fynd"-rankning (`buildDealCandidates`):** topplistan sorteras på **huvudproteinets** besparing (`mainProteinSaving()` — receptets `protein`-kategori mot träffarnas canon via `canonProteinCategory()`), inte totalen, så lök/vitlök aldrig lyfter ett recept. Ovanpå det **variationsvikt** (`diversifyByProtein()`, decay 0.55): samma proteintyp dämpas för varje återkomst så listan inte blir 25 kycklingrätter när kyckling är extrapris. Recept där huvudproteinet inte är på rea (eller vegetariska) hamnar under, sorterade på värdeviktad besparing. Visad kr-besparing oförändrad.
- **Vercel timeout:** 15s (ingen AI-väntan).

## Recept — struktur (Supabase `recipes`, sanningskälla)
`recipes.json` är **retirerad** (Fas 8.4). Recepten bor i Supabase-tabellen
`recipes`. Dev-skript läser en gitignorerad cache (`scripts/.cache/recipes.json`)
via `node scripts/export-recipes.mjs`; producenter (import) skriver direkt till
Supabase. Fält ↔ rad-mappning: `js/data-mapper.js` (`recipeFromRow`/`recipeToRow`).

Recept-objekt (appens format, snake_case-kolumner i DB):
```json
{
  "id": 1, "title": "Receptnamn", "tested": false, "servings": 4,
  "time": 40, "timeNote": "ugn 150°",
  "tags": ["helg60", "fisk", "ugn"], "protein": "fisk",
  "ingredients": ["600 g torsk", "..."],
  "instructions": ["Steg 1...", "Steg 2..."],
  "notes": "Tips: ...", "seasons": ["höst", "vinter"]
}
```
**Protein:** `fisk` | `kyckling` | `kött` | `fläsk` | `vegetarisk`
**Taggar:** `vardag30` (≤30 min vardag), `helg60` (≤60 min helg), `soppa/pasta/wok/ugn/sallad/gryta/ramen` (typ), `veg` (vegetariskt)

### Kanoniskt ingrediensformat (Fas 8)
En optimal ingrediensrad har en **definierbar mängd** (antal/vikt/volym):
- **Föredra** `"<mängd> <enhet> <namn>"` (`"2 dl grädde"`, `"600 g torsk"`) eller
  doh-format `"<namn> (<mängd> <enhet>)"` (`"zucchini (400 g)"`) — parsern hanterar båda.
- **En ingrediens per rad** (dela `"X och Y"`/`"X eller Y"` om båda ska handlas).
- **Skafferivaror** (salt, peppar, olja till stekning) får sakna mängd — de skippas medvetet.
- Verktyg: `node scripts/audit-ingredients.mjs` graderar avvikelser (P0/P1/P2).

## Dataformat — genererade filer
```json
// weekly-plan.json
{ "generated": "2026-03-14", "startDate": "...", "endDate": "...",
  "days": [{ "date": "2026-03-14", "day": "Fredag", "recipe": "Titel", "recipeId": 23,
             "saving": 12, "savingMatches": [{ "canon": "...", "name": "...", ... }] }] }

// shopping-list.json
{ "generated": "2026-03-14", "categories": {
    "Mejeri": ["grädde (2 dl)"], "Grönsaker": ["purjolök (1)"],
    "Fisk & kött": ["torsk (600 g)"], "Frukt": [], "Skafferi": [], "Övrigt": [] }}

// recipe-history.json
{ "usedOn": { "5": "2026-03-26", "23": "2026-03-14" } }
```

## Hur Claude ska tänka
- Förstå den övergripande ambitionen (självgående familjeapp), inte bara den enskilda frågan
- Tänk på hela familjen som användare — inte bara den tekniska personen
- **Uppdatera `docs/status.md` efter varje större ändring** (verifieringskö + ny Senaste session + digest). CLAUDE.md ändras bara när den stabila kontexten gör det.
