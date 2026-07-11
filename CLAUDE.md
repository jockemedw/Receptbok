# Receptboken — Projektkontext för Claude Code

## Vad det här projektet är
Personlig matplaneringsapp för familjen (två vuxna + litet barn). Användaren väljer datum och inställningar, appen genererar matsedel + inköpslista och sparar centralt så hela familjen ser samma data på alla enheter. Appen har växt till en familjehubb (delade listor, anteckningar; kalender planerad) och har en beslutad monetiseringsriktning (se *Monetiseringsriktning* nedan) — men familjens instans är och förblir gratis.

## Arkitektur
```
Browser (index.html + js/-moduler)
   ├─ läser/skriver Supabase direkt (RLS skyddar; recept, planer, inköp, listor, skafferi)
   └─ anropar Vercel /api/* (JWT-auth) för orkestrering: generering, dispatch, import, deals
Vercel serverless (api/) ── service-role → Supabase (Postgres + Auth + Realtime)
                         └─ inofficiella Willys-endpoints (reor + varukorg)
```
- **Frontend:** `index.html` (~620 rader ren markup) + `js/`-moduler. Hostas på Vercel (primär, `https://receptbok-six.vercel.app/`) + GitHub Pages (backup).
- **Backend:** Vercel serverless i `api/` — max-tider per funktion i `vercel.json` (generate 15s, import-recipe 30s, dispatch 60s).
- **Data — Supabase är sanningskällan.** Tabeller: `recipes` · `weekly_plans` + `meal_days` (custom-/egna dagar = `meal_days` med `plan_id NULL` — **bevaras alltid vid generering**) · `shopping_lists` + items · `recipe_history` (`usedOn` per hushåll, 14-dagarsfönster) · `plan_archives` · `pantry_items` (skafferi/"har hemma") · `family_lists` + `family_list_items` (listor & anteckningar) · `pricing_status` (larmbanner) · `households` + `household_members`. Fält↔rad-mappning för recept: `js/data-mapper.js`.
- **GitHub-JSON: nästan avvecklad.** Enda aktiva filen är `dispatch-preferences.json` (inköpspreferenser, läses/skrivs via `api/_shared/github.js` med 3-retry-SHA). Övriga JSON-filer i repo-roten (`weekly-plan.json`, `shopping-list.json`, `recipe-history.json`, `custom-days.json`, `plan-archive.json`, `offers.json`) är **kvarlämnade och läses inte av koden** — rör dem inte, radera dem inte utan Joakims OK.
- **Secrets (Vercel env):** `GITHUB_PAT` (contents:write, dispatch-preferences), `GITHUB_GIST_PAT` (Willys-cookies i secret gist — avvecklas i backlog #5), `GOOGLE_API_KEY` (Gemini-import), Supabase-nycklar (anon + service role), `WILLYS_STORE_ID` (fallback 2160), `ALERT_WEBHOOK` (valfri). Logga aldrig secrets, skriv dem aldrig till repot.
- **Autentisering:** Lösenordsbaserad via Supabase Auth; skrivande API-endpoints kräver JWT (`requireUser` i `api/_shared/handler.js`, klienten använder `apiFetch` i `js/supabase-client.js`). Ny registrering avstängd — nya familjemedlemmar läggs till manuellt i `household_members` + Supabase-dashboarden. (Självregistrering med inbjudningskoder byggs först i monetiserings-M1.)
- **AI-kostnad:** endast receptimport (foto/URL) via Gemini (gratistier). Receptval är kostnadsfritt och deterministiskt.
- **Supabase free-tier pausar efter ~1 v inaktivitet** — frontend visar "appen har vilat"-besked (Session 106). Med daglig användning inträffar det inte. Keep-alive-ping saknas (backlog #11); extern cron som bara *läser* en hälsosida är OK enligt principerna.
- **Supabase-admin från Claude Code-moln-miljön:** `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF` finns som env-vars i webbsessionerna (INTE på Joakims lokala dator). Verifierings-SQL (läsningar mot `information_schema`/`pg_policies` etc.) får köras fritt via Management-API:t:
  `curl -X POST "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" -d '{"query":"…"}'`
  (Använd `curl` — Cloudflare blockerar python-urllib.) **Schemaändringar (migrationer/DDL/skrivande SQL) körs BARA på Joakims uttryckliga uppmaning i sessionen** — aldrig autonomt i nattjobb. Arbetsgång: lägg idempotent SQL-fil i `db/migrations/` (`IF NOT EXISTS`/`OR REPLACE`), invänta klartecken, kör via API:t, verifiera. Tokenen är kontobred — logga den aldrig.

## Designprinciper (följ alltid)
- **Familjens instans är gratis** — inga betalväggar eller annonser för hushåll #1, oavsett vad monetiseringen bygger. Nya driftskostnader kräver stark motivering.
- **Ingen automatisk generering** — matsedeln triggas alltid manuellt. Familjen har litet barn och kan inte styra inköp till en fast veckodag. Föreslå aldrig cron-schema för generering. (Utskick som *påminner/föreslår* utan att generera är OK.)
- **Delad data** — localStorage och device-specifika lösningar är aldrig acceptabla för delat innehåll. (Rena vy-preferenser i minnet, t.ex. handla-läget, är OK.)
- **Ingen AI i runtime** — receptval sker deterministiskt (filter + slump + proteinbalans). AI används vid utveckling (Claude Code) och import (Gemini) — aldrig i genererings-/inköpsflödet. Detta är även monetiseringens vallgrav: 0 kr marginalkostnad per användare.
- **Vercel är backend** — GitHub Actions ingår inte i produktflödet (CI-workflowen `.github/workflows/test.yml` kör bara testsviten vid push/PR).

## Hårda invarianter (bryts ALDRIG utan Joakims uttryckliga OK)
1. **Befintlig veckoplan får aldrig förstöras** som sidoeffekt av kod-ändringar (Session 23). Custom-dagar (`plan_id NULL`) bevaras alltid.
2. **Rör aldrig recept-strukturen** (Supabase `recipes`, fälten i `js/data-mapper.js`) utan explicit instruktion.
3. **`api/` får ha högst 12 filer** — Vercels gratisplan tillåter max 12 serverless-functions; en 13:e fil gör att HELA deployen failar tyst (hände Session 121). Ny endpoint? Slå ihop med befintlig fil (mönster: `api/deals.js` kör GET+POST) eller fråga.
4. **Skrivande endpoints kräver JWT-auth** — ny endpoint byggs alltid via `api/_shared/handler.js`-wrappern.
5. **Datamuterande ändringar är aldrig "render-only"** — märk varje ändring som render-only ELLER datamuterande i commit/status, och testa det senare mot hela sviten.

## Kommunikation med användaren
- **Förklaringsnivå 3.5** — använd analogi + teknisk term i parentes vid behov. Nivå 1–2 för rutinändringar, 3.5 vid beslut eller felsökning.
- **Felmeddelanden i appen** — alltid på begriplig svenska utan tekniska termer, med handlingsorienterad uppmaning. Inte: `409 — SHA conflict`. Utan: `Kunde inte spara matsedeln — prova att generera igen.`
- **Stanna och bekräfta** — om ett meddelande är feedback/återkoppling (inte en tydlig instruktion), tolka det INTE som en order att agera. Ställ en kort fråga och invänta svar.
- Claude pushar direkt till `main` efter varje ändring — användaren behöver inte använda GitHub Desktop.

## Deployment & versionsbump (viktig konvention!)
- Commit + push till `main` → Vercel + GitHub Pages deployas automatiskt (~30 sek). Ingen manuell åtgärd.
- **Vid varje frontend-ändring som ska nå mobilen: bumpa versionerna.** CSS: `css/styles.css?v=N` i `index.html`. JS-entry: `js/app.js?v=N` i `index.html`. Service worker: `CACHE_VERSION = 'receptbok-vN'` i `service-worker.js`. Utan bump ser Joakim gamla cachade filer och tror att ändringen inte fungerar.
- **Verifiering:** Joakim har ingen lokal testmiljö — UI verifieras på mobil mot live-deployen. Playwright/headless lokalt är för-verifiering; skarp mobilverifiering loggas i verifieringskön i `docs/status.md`.

## Operativa regler (följ utan att fråga)
- Frontend-JS ligger i `js/`-moduler — redigera rätt modulfil, inte `index.html` (ren HTML-markup).
- Appen ska fungera på alla enheter; mobil prioriteras (touch-first, hover aldrig som primär interaktion, touch-targets ≥44px, respektera `prefers-reduced-motion`).
- **Mergea till main** — efter varje push, mergea feature-branchen till `main` (squash-PR är mönstret). Skippa bara om användaren explicit ber om det.
- Nya tabeller får RLS med household-policy-mallen (kopiera från `db/migrations/002_pantry_items.sql`).

## Monetiseringsriktning (beslutad 2026-07-10/11 — stabil kontext)
Mål: appen ska tjäna in Claude Code Max 20× + infra ≈ **2 750 kr/mån ≈ 75 betalande hushåll** à 39 kr/mån via **webb-prenumeration (Stripe)** — inte annonser, inte App Store (uppskjutet). Publikt namn: **Middagsveckan** (middagsveckan.se; UI-namnbyte först vid M2/landningssidan). Trappa M0→M5 med kill-kriterier, funktionsgap G1–G18 och alla beslut: `docs/monetisering-roadmap-2026-07.md` + `docs/konkurrens-funktionsanalys-2026-07.md`. Nästa byggsteg när Joakim säger till: **M1** (tenancy #5–#6, allergen-filter, onboarding, receptbilder, magisk länk, butiksgångordning, recept-grovmärkning egna/importerade). Willys-hållning: reor-läsning får ingå i premium (öppen degraderingsrisk accepterad); **korgfyllningen/dispatchen förblir familje-exklusiv** tills ev. partnerskap.

## Status & dashboard (rörlig — bor i `docs/status.md`)
Rörlig status (roadmap, kända buggar, verifieringskö, öppna utredningar, senaste session) bor i `docs/status.md` — inte här. SessionStart-hooken visar digest-blocket (`<!-- DIGEST:START/END -->`) + git-status. Läs hela `docs/status.md` vid behov; arkiv i `docs/session-log-archive.md`.

## Arbetsarkitektur (modellval + orkestrering)
Vilken modell gör vad (Opus 4.8 default, Sonnet 5 arbetshäst, Haiku 4.5 fan-out, Fable 5 för det svåraste), när subagenter/workflows används, och månatlig omvärdering — bor i `docs/claude-orchestration.md`.

## Kommandon (tester & skript)
Inga npm-scripts — allt körs direkt med `node`. Hela sviten ska vara GRÖN innan "klart" (hooks i `.claude/settings.json` kör relevanta tester vid Edit och blockerar vid fail — kör ändå hela sviten manuellt vid ändringar som rör flera moduler). Hårdkoda aldrig assertionstal i dokumentation — de ändras löpande.

```bash
node tests/match.test.js               # Willys-matchning + ingrediens-normalizer
node tests/match-corpus.test.js        # accept/reject-korpus
node tests/shopping.test.js            # inköpslista (clean→parse→merge→categorize)
node tests/select-recipes.test.js      # deterministiskt receptval
node tests/data-mapper.test.js         # recipeFromRow/recipeToRow
node tests/dispatch-to-willys.test.js  # kräver node_modules
node tests/cookies-endpoint.test.js    # kräver node_modules

node --check js/app.js                 # syntaxkoll (PostToolUse-hooken gör detta auto)

# Dev-skript (läser live Supabase via REST, beroendefria)
node scripts/export-recipes.mjs        # synka gitignorerad cache scripts/.cache/recipes.json
node scripts/audit-ingredients.mjs     # gradera ingrediensavvikelser (P0/P1/P2)
```

## Definition of Done (följ alltid)
Innan "klart" deklareras ska Claude alltid:
1. Läsa tillbaka den editerade filen och verifiera att ändringen landade rätt (Edit-hooken fångar syntaxfel).
2. Kontrollera att relaterade funktioner inte brutits — Grep efter berörda funktionsnamn om tveksamt; kör hela testsviten vid fleramodulsändringar.
3. Vid frontend-ändring: bumpa styles-/app-/SW-versionerna (se *Deployment*).
4. Committa och pusha; mergea till `main`.
5. Uppdatera `docs/status.md`: ny "Senaste session"-ruta + verifieringskö + digest-blocket om öppet läge ändrats. CLAUDE.md rörs bara om den *stabila* kontexten ändrats.
6. **Arkivera föregående session:** flytta nuvarande sessionsruta till toppen av `docs/session-log-archive.md` (status.md håller bara EN ruta). Lyft oavslutade punkter till *Kända buggar* / *Väntar på live-verifiering* / *Öppna utredningar* — öppet arbete ska synas strukturerat, inte begravas i prosa.

## Modulstruktur (VSA — vertical slice architecture)
Varje feature-slice är en fristående fil; en agent behöver bara läsa 1–2 filer per feature. Verifiera live med `ls js/` och `ls api/`.

- **Frontend** (`js/`): `app.js` (entry) · `state.js` (delade `window.*`-vars) · `utils.js` (delade hjälpare, escapers) · `auth-gate.js` · `supabase-client.js` (`apiFetch`) · `data-mapper.js` · `ui/` (scroll, navigation) · `today/` (Idag-fliken, startvy) · `weekly-plan/` (generator, viewer, prisoptimera, ingredient-preview) · `shopping/` · `lists/` (familjelistor + anteckningar) · `recipes/` (browser, editor, import).
- **Backend** (`api/`): endpoints som egna filer (max 12 — se invariant #3). Delad infrastruktur i `api/_shared/`: `handler.js` (CORS+JWT+error-wrapping) · `supabase.js` (`db`, `getHouseholdId` — OBS: tar "första hushållet", multi-tenant-fix är backlog #6) · `select-recipes.js` · `shopping-builder.js` · `willys-matcher.js` · `dispatch-matcher.js` · `willys-cart-client.js`/`-search.js` · `github.js` · `history.js` · `constants.js` · `day-ops.js` · `alert.js` · `secrets-store.js`.
- **Cross-modul-anrop:** funktioner exponeras via `window.*` — moduler anropar varandra via `window.funktionsNamn()`, inga cirkulära ES6-imports. Domänlogik stannar i sin slice; bara teknisk infrastruktur delas.

## Tekniska beslut
- **Färgtema:** Linen-canvas `#f5f1e8`, lichen-grön header `#7a9482`, rust-accent `#b56a4c` (CTA + today). Forest `#3d5544` text, ochre `#c89a3e` wordmark-suffix, lichen-deep `#5e7a68` success/savings. Mörkt tema finns — styla alltid båda lägena.
- **Receptval:** deterministisk algoritm i `api/_shared/select-recipes.js` — historikfiltrering (14 dagar via `recipe_history`) → proteinfördelning (max 2 per typ) → vardag30/helg60-matchning → säsongsviktning → slump. Ingen AI.
- **Inköpslista:** byggs deterministiskt från receptdata — pipeline Clean → Parse → Normalize → Merge → Categorize. Sortering A–Ö per kategori, format `"ingrediensnamn (mängd)"`. Kategorier: Mejeri, Grönsaker, Fisk & kött, Frukt, Skafferi, Övrigt.
- **Recepthistorik:** Supabase-tabellen `recipe_history` — ett datum per recept och hushåll (`usedOn`-format i koden), 14-dagarsfönster, fallback sorterad på "längst sedan".
- **Inställningar:** oprövade (direkt siffra), vegetariska dagar (direkt siffra), proteintoggle med receptantal, portioner (hushållsskalning #12). Ingen tidsväljare, inget fritextfält.
- **Prisoptimering — reor-först-flöde (Session 121):** egen yta `js/weekly-plan/prisoptimera.js`, nås från Matsedel-rubriken (`.prisopt-btn`) och genereringsguidens steg 2 (`.wiz-prisopt`). Steg 1: `GET /api/deals` → Willys-reor grupperade per ingrediens (canon via `extractOfferCanon`), bästa besparing först. Steg 2: `POST /api/deals {canons}` → recept som använder valda varor via `matchRecipe`, störst besparing först → "Lägg in på en dag" via `/api/replace-recipe`. GET+POST bor i EN fil (12-gränsen, invariant #3). Genereringen är prisagnostisk (gamla `optimize_prices`-toggeln borttagen ur UI:t).
- **Matchning (delad):** `matchRecipe`/`extractOfferCanon`/`canonProteinCategory`/`weightedSaving` i `api/_shared/willys-matcher.js` — samma canon-lexikon som inköpslistan. Dispatchen väljer störst `savingPerUnit` per canon (samma regel som planens besparing).
- **Willys-dispatch:** korgfyllning via användarens sessionscookies (fångas med egen browser-extension, lagras i secret gist — flytt till Supabase/RLS är backlog #5). Familje-exklusiv feature (se *Monetiseringsriktning*).

## Recept — struktur (Supabase `recipes`, sanningskälla)
Recepten bor i Supabase-tabellen `recipes` (`recipes.json` är retirerad sedan Fas 8.4). Dev-skript läser gitignorerad cache via `node scripts/export-recipes.mjs`; producenter (import) skriver direkt till Supabase. Mappning: `js/data-mapper.js` (`recipeFromRow`/`recipeToRow`).

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
- **Föredra** `"<mängd> <enhet> <namn>"` (`"2 dl grädde"`, `"600 g torsk"`) eller doh-format `"<namn> (<mängd> <enhet>)"` (`"zucchini (400 g)"`) — parsern hanterar båda.
- **En ingrediens per rad** (dela `"X och Y"`/`"X eller Y"` om båda ska handlas).
- **Skafferivaror** (salt, peppar, olja till stekning) får sakna mängd — de skippas medvetet.
- Verktyg: `node scripts/audit-ingredients.mjs` graderar avvikelser (P0/P1/P2).

## Hur Claude ska tänka
- Förstå den övergripande ambitionen (självgående familjeapp på väg mot 75 betalande hushåll), inte bara den enskilda frågan.
- Tänk på hela familjen som användare — inte bara den tekniska personen. Snart: främmande familjer utan teknikintresse.
- Vid osäkerhet om en regel: invarianterna ovan vinner över allt annat; därefter `docs/status.md`; fråga hellre än gissa vid datamuterande ändringar.
- **Uppdatera `docs/status.md` efter varje större ändring** (DoD punkt 5–6). CLAUDE.md ändras bara när den stabila kontexten gör det.
