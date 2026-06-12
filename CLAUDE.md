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

## Dashboard (visas vid sessionstart)
Vid varje ny session: visa denna dashboard för användaren EXAKT som den ser ut nedan.
Ändra ingenting — slå inte ihop rader, kollapsera inte checkboxar, lägg inte till egna rubriker.
Kopiera sektionerna rakt av (markdown-format). Enda tillagda info är git-status från SessionStart-hooken,
som visas som tre rader i klartext (branch, status, senaste commit) överst.

### Roadmap
**Fas 1 — Extrapriser → receptförslag** (research klar → `docs/research-extrapriser.md`)
- [x] 1A — Tjek/eTilbudsavis API — otillräcklig (14% täckning)
- [ ] 1B — ICA inofficiellt API — hoppas över (Willys räcker)
- [x] 1C — Willys API: `GET /search/campaigns/online?q=<storeId>&type=PERSONAL_GENERAL&size=500` (ingen auth). Store 2160 = Ekholmen → 199 erbjudanden
- [ ] 1C2 — Willys+ medlemserbjudanden — utforskning pågår (se Öppna utredningar)
- [x] 1D — Matchningslogik klar (Session 35, `docs/match-audit-2026-04-19.md`). 53/62 recept, 149 matches. `CANON_REJECT_PATTERNS` + n-gram-stemming. 51 assertions i `tests/match.test.js`.
- [x] 1E — UX-design beslutad
- [x] 1F — Implementation klar + live-verifierad (Session 51). `dry_run`-parameter, 51 assertions i match.test.js.

**Fas 2 — Familjelärande algoritm**
- [ ] 2A — Analysera befintlig data
- [ ] 2B — Designa viktningsmodell
- [ ] 2C — Implementation + "Favoriter"-vy

**Fas 3 — Internationell receptimport**
- [x] 3A — Format + sajter kartlagda (Session 28, `docs/research-internationell-import.md`). 7/18 bot-blockerade. JSON-LD + Gemini-fallback.
- [x] 3B — Konverteringsmodul klar (Session 64). `postProcessForeignRecipe()` + `callGeminiRaw()` + enhetskonvertering (cups→dl, °F→°C m.fl.) + ingrediensöversättning.
- [x] 3C — Live-verifierat (Session 64): budgetbytes.com, kochbar.de, jamieoliver.com → svenska ingredienser + metriska enheter. **Fas 3 helt klar.**

**Fas 4 — Automatisk varukorgsfyllning** (spec: `docs/superpowers/specs/2026-04-20-willys-dispatch-design.md`)
- [x] 4A–4C — Research, PoC, UX-design klar
- [x] 4D — Implementation live-verifierad (Session 39). `/api/dispatch-to-willys`, moduler: `willys-search.js`, `willys-cart-client.js`, `dispatch-matcher.js`. 56 assertions.
- [x] 4E — Söknings-fallback live (Session 39). Publik `GET willys.se/search?q=<canon>`. Canon-guard via `CANON_REJECT_PATTERNS`.
- [x] 4F — Cookie-refresh-automatisering **live-verifierad (Session 78)**. Chrome-extension MV3 → secret gist → `secrets-store` (5-min cache). Engångs-setup klar (gist + env vars + extension). **Fas 4 helt klar** — 27 varor landade i korgen i skarp körning.

**Fas 5 — App Store & monetisering** (`docs/marknadsanalys-2026-04.md`)
- [x] Marknadsanalys
- [x] 5A — Rekommendation: Capacitor (3–5 v). PWA blockas iOS (Guideline 4.2), RN = full omskrivning. (`docs/research-teknisk-vag-app.md`)
- [ ] 5B — Autentisering & datamodell
- [ ] 5C — Kostnads- och intäktskalkyl

**Fas 6 — Säsongsoptimering** (klar, Session 52)
- [x] 6A — Research: säsongstabell ~120 ingredienser × 12 månader → `docs/research-sasong.md`
- [x] 6B — 242/264 recept taggade med `seasons`-fält. 22 neutrala.
- [x] 6C — `applySeasonWeight()` i `selectRecipes()`: in-season 2x, neutral 1x, off-season 0.5x. Toggle `season_weight`.
- [x] 6D — "Säsongsanpassning"-toggle i inställningar + säsongsfilter (vår/sommar/höst/vinter) i receptboken.
- [x] 6E — 3 säsongstaggar rättade (Session 63): ID 12, 98, 172.

**Fas 7 — Supabase-migration** ✅ **KLAR (Session 60, mergad till main 2026-05-23)**
- [x] 7A — Tabellschema + RLS + households
- [x] 7B — Seedning: 264 recept + alla JSON-filer via `scripts/migrate-to-supabase.mjs --commit`
- [x] 7C steg 1–4 — Frontend-omskrivning + realtime-subscriptions för `meal_days` + `shopping_items` (Sessions 58, 63)
- [x] 7D — Backend: alla API-endpoints mot Supabase (Session 59)
- [x] 7E — Cutover mergad till main (Session 60, commit `45a6433`). 671 assertions.

**Fas 8 — Ingrediens-kvalitetskontroll** (plan: `docs/ingredient-qc-plan-2026-06-03.md`)
- [x] 8.0 — Audit-verktyg (`scripts/audit-ingredients.mjs`) mot Supabase. Baseline (Session 77): P0=1, P1=309, P2=1372, 567 icke-canon-namn. Rapport: `docs/ingredient-audit-2026-06-03.md`.
- [x] 8.1 — Parser-buggfix: ⅓⅔⅛-fraktioner (`FRACS` + regexar + display). P0 1→0. +5 assertions (shopping 67/67).
- [x] 8.2 — Canon-utökning (~80 mappningar + kategori-nyckelord). Canon-täckning 17%→30%, P2 1372→728, icke-canon 567→404.
- [x] 8.3 — Löst i kod (ingen datamutation): doh-parsern skannar nu alla parenteser/klausuler + "ca/från/+/storleksadjektiv", och audit-heuristiken hoppar vaga/valfria + adjektiv-"och". **P1 309→68** (−78 %). +14 assertions (shopping 81/81). 68 kvar = genuin författar-vaghet (stek-olja, "för 4 pers", valfria garneringar).
- [x] 8.4 — `recipes.json` retirerad. Delad Supabase-källa (`scripts/_lib/recipes-source.mjs`) + `export-recipes.mjs` → gitignorerad cache. Läsare repekade (recipe-audit, season-analysis, audit-ingredients). Import-pipeline (scrape/promote) skriver nu direkt till Supabase. Obsoleta engångsskript spärrade (recipe-fix, classify-cuisine, migrate, generate_weekly_plan.py). Kanoniskt format dokumenterat.

### Kända buggar
Inga bekräftade just nu.

### Väntar på live-verifiering (kod klar, ej körd skarpt)
- **Lösvikts-enum vid Willys-export** (PR #65): `pickUnitForCode()` skickar `"kilograms"` för `_KG`-koder (lös färskvara, t.ex. potatis). Enum-värdet är *inferred* — bara `"pieces"` är PoC-bekräftat. Bekräfta i en skarp körning att lös potatis landar i korgen.
- **"Gör fri dag" (free/unfree)** (Session 71): `api/skip-day.js` omskriven + verifierad via standalone-simulering, men aldrig körd mot live-DB (skulle mutera aktiv plan). Bekräfta på en testplan att free→unfree round-trip bevarar planen.
- **Helhetsomtaget Session 86 (PR #73, mergad till main 2026-06-12):** preview-testat av Joakim före merge. Kvar att bekräfta mot produktion (snabbkoll): (1) PWA: "Lägg till på hemskärmen" från produktions-URL:en ger egen ikon + appen öppnar offline (skalet), (2) matlagningslägets Wake Lock på riktig mobil, (3) skip-day/swap-days mot live-DB (nu med plan_id-filter), (4) Ångra på borttagen inköpsvara + progress-synk från annan enhet.
- **Premiumvy för matsedeln** (Session 84, PR #69, mergad; justerad Session 85, PR #70): kod klar + testsvit grön, men inte verifierad på mobil mot produktion. Bekräfta att Premium-vyn renderar, att alla åtgärder fungerar (slumpa/välj/byt dag/fri dag/besparing/egen planering) och att växeln Premium↔Klassisk håller båda vyerna i synk. Default är Premium — flippa till Klassisk om något strular. **Session 85-tillägg att kolla:** (1) helg visas nu som en diskret prick på dagkortets färgrygg (ej textpill) → bekräfta att helgkort är lika höga som vardagskort; (2) "Vecka N"-avdelare dyker upp i listan där ISO-veckan byter (syns bara på planer som spänner två veckor).

### Öppna utredningar
**Receptkvalitet — uppföljning från nattjobbet (Session 83, se `docs/qc-night/report-2026-06-07.md`):**
- **Canon-kandidater (kod, EJ tillämpat):** säkra tillägg till `NORMALIZATION_TABLE` höjer pris-matchbarhet — plural-buljongtärningar (`grönsaksbuljongtärningar`→grönsaksbuljong m.fl.), self-canons (`matvete`, `torsk`, `pizzadeg`, `nori`, `citrongräs`), `portobellosvamp`/`baby bella-svamp`→champinjoner. Hölls utanför nattjobbets data-scope; vänta på Joakims OK.
- **Manuell uppdelning behövs (parentes döljer varor):** #27 `2 dl oliver och hackade soltorkade tomater` (oliver tappas idag), #235 `rödkål (… morötter, salladslök, vinäger …)` (slaw-varor hamnar ej på listan). Kräver mängdbeslut.
- **Avsiktligt vaga (lämnade):** "för 4 pers"-kolhydrater (#31,#49,#265,#269,#270,#271) + nöt/frö-mixar (#43,#58,#70). Lista i rapporten.
- **Revert hela jobbet:** in-DB snapshot `recipes_qc_backup_20260607` finns kvar → säg *"revert nattjobbet"*.

**Matchnings-täckning — långsvansen (löpande):** vanliga varor förbättrades över Sessions 78–81, men en full audit av sällan-matchade ingredienser kräver Supabase-nätåtkomst. Öppet bedömningsfall (väntar på Joakim, se `docs/match-hardening-natt-2026-06-05.md`): ska generisk "grädde" tillåtas falla till vispgrädde i sök-fallbacken?

**Willys+ medlemserbjudanden — 3-fas utforskning:**
- **Fas A — Rekon:** Vilka inloggningsmetoder erbjuder willys.se? BankID? E-post+lösenord? "Kom ihåg mig"-cookies? Mobilapp-OAuth?
- **Fas B — Validering:** Logga in manuellt, hämta `https://www.willys.se/search/campaigns/online?q=2160&type=PERSONAL_SEGMENTED&page=0&size=500` i devtools och klistra in svaret. Avgör om Fas C är värd tid.
- **Fas C — Automatiseringsväg:** Väg 1: manuell cookie-export (lätt, skört). Väg 2: scripted login (medelsvårt). Väg 3: BankID — dödsvägen. Väg 4: acceptera anonyma priser, märk UI:t.

### Idéer (användarens)
*(Inga öppna idéer just nu — Mobil bottom-tab-nav implementerad i Session 41.)*

### Claudes idéer
- "Veckans vinnare"-vy — familjen röstar på bästa receptet varje vecka, bygger favoritdata
- Portionsskalning i matlagningsläget — ×0.5/×2 räknar om mängderna i ingredienslistan
- ~~Offline-stöd via service worker~~ — implementerad i Session 86 (appskalet cachas; data kräver nät)

### Senaste session — Session 86 (2026-06-11) — Helhetsomtag (Fable 5-natten): feedback, matlagningsläge, PWA

Mål (användarbegäran, fria händer): nattjobb med komplett analys + omtag där det ger värde. Två granskningsagenter auditerade frontend/backend; implementation på branch `claude/fable5-redesign-overhaul-4rb4dx` → **PR #73, preview-testad av Joakim och mergad till main 2026-06-12**.

- **Feedback-fundament (`js/ui/feedback.js`):** toast-system (`showToast`) + promise-baserad bekräftelsedialog (`confirmDialog`) i appens designspråk. Alla `alert()`/`confirm()` ersatta (shopping-list, ingredient-preview, kassera plan, ta bort recept, rea-varningen). **"Rensa lista" hade INGEN bekräftelse — nu kräver den en.** Borttagna inköpsvaror får "Ångra"-toast (raden hämtas före delete, återinsätts vid ångra).
- **Inköpslistan:** progressrad "X av Y klara" + progressbar (`updateShopProgress` uppdaterar på plats, även från realtime), kategoriräknare "klara av totalt", touch-vänliga rader (~48px), runda checkboxar, premium-kortstil. Nycklar/bock-logik orörda.
- **Matlagningsläge (`js/ui/cook-mode.js`):** "Börja laga" i receptdetaljen (receptboken via `renderDetailInner` + premiumvyn via `dlx-cook-btn`) → fullskärmsvy med stor text, bockbara ingredienser + steg, progressbar och **Wake Lock** (skärmen släcks inte vid spisen; återtas vid visibilitychange).
- **PWA:** `manifest.webmanifest` + `service-worker.js` (navigering: nät först, cache bara offline; statiska filer: stale-while-revalidate; `/api/` + andra origins rörs aldrig) + ikoner i `icons/` från `scripts/generate-icons.py` (ren Python, tallrik i Scandi-paletten, maskable + apple-touch-icon). Registreras i `app.js` med relativ sökväg (Vercel + GitHub Pages).
- **"Ikväll"-rad i premium-heron:** `buildTonight()` visar dagens middag (recept/egen planering/fri dag); tryck expanderar dagens kort.
- **Touch & tillgänglighet:** −/+-steppers runt sifferfälten i inställningarna (`stepNum`), `.prot-btn` ≥40px, `.pill-toggle` utökad träffyta (~44px), header-tab-kontrast 0.45→0.72, `.pill-untested`-kontrast höjd. Tomma matsedelsvyn fick CTA "+ Skapa matsedel" (`openNewPlan`). Receptkorten fick proteinfärgad rygg (samma språk som premiumvyns dagkort).
- **Backend-härdning:** `handler.js` maskerar programfel (TypeError m.fl.) med generiskt svenskt meddelande — avsiktliga `new Error("…")` visas fortfarande; `skip-day`/`swap-days` skriver nu med `plan_id`-filter (skyddar egen planering-rader på samma datum); `generate.js` validerar serverside (max 15 dagar, inställningsvärden klampas till spannet).
- **Verifierat:** `node --check` rent på alla ändrade filer; hela testsviten grön — match 103, corpus 35, shopping 81, select 432, data-mapper 27, dispatch 93, cookies 29 (800 assertions). Versioner: `styles.css?v=97`, `app.js?v=95`.
- **Kvar:** snabbkoll mot produktion efter merge (se *Väntar på live-verifiering*).

### Tidigare sessioner
Session 8–85 i `docs/session-log-archive.md`. Full git-historik: `git log --oneline`.

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
4. Uppdatera Dashboard-sektionen i CLAUDE.md (senaste session, buggar, roadmap-checkboxar)
5. **Arkivera föregående session:** innan ny "Senaste session"-ruta skrivs, flytta den nuvarande till toppen av `docs/session-log-archive.md`. CLAUDE.md håller bara *en* sessionsruta. Lyft oavslutade "kvar att fixa"-punkter till *Kända buggar* / *Väntar på live-verifiering* / *Öppna utredningar* innan arkivering — öppet arbete ska synas i de strukturerade sektionerna, inte begravas i prosa.

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
- **Prisoptimering (opt-in toggle):** `optimize_prices`-flag → hämtar Willys-erbjudanden → `bucketBySaving()` sorterar recept med ≥10 kr besparing först i poolen. Filter (historik/veg/protein/låsta/blockerade) respekteras fullt.
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
- **Uppdatera CLAUDE.md efter varje större ändring** (Dashboard + ny Senaste session)
