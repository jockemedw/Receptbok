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
- **Verifiering:** Användaren har ingen lokal testmiljö — verifierar UI-ändringar på mobil mot live Vercel-deploy. Push till main, vänta ~30 sek, öppna `https://receptbok-six.vercel.app/` på telefonen.

## Operativa regler (följ utan att fråga)
- Frontend-JS ligger i `js/`-moduler — redigera rätt modulfil, inte `index.html` (som bara är HTML-markup, ~290 rader)
- Rör aldrig `recipes.json`-strukturen utan explicit instruktion
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
- [x] 1A — Tjek/eTilbudsavis API — **utredd, otillräcklig** (endast 14% täckning)
- [ ] 1B — ICA inofficiellt API — **hoppas över** (Willys räcker för Ekholmen-fallet)
- [x] 1C — Willys API reverse engineering — **klart**: `GET /search/campaigns/online?q=<storeId>&type=PERSONAL_GENERAL&size=500` (ingen auth, ingen CSRF, ingen session). Store 2160 = Ekholmen → 199 erbjudanden
- [ ] 1C2 — Willys+ medlemserbjudanden — **utforskning pågår** (Fas A/B/C, se Öppna utredningar)
- [x] 1D — Matchningslogik **klar** (audit genomförd Session 35, rapport: `docs/match-audit-2026-04-19.md`). 53/62 recept matchar (upp från 51), 149 matches totalt (upp från 125), **spraygrädde-buggklassen eliminerad** via `CANON_REJECT_PATTERNS`. Priority 2-stemming implementerad via adjektiv-strip + token-scan + n-gram-fallback i `normalizeName`. Nya self-canons (aubergine/gurka/zucchini/paprika/chili/sallad) + utökad NON_FOOD_RE. 51 regressiontester i `tests/match.test.js` bevakade av PostToolUse-hook.
- [x] 1E — UX-design — **beslutad** (se nedan)
- [x] 1F — Implementation **klar och live-verifierad** (Session 51, 2026-05-10). `dry_run`-parameter verifierade hela pipelinen utan att röra veckoplan. Matchningsbuggar (smör→popcorn, rapsolja→sardeller) fixade via `CANON_REJECT_PATTERNS`. 51 assertions i match.test.js (upp från 44).

**Fas 2 — Familjelärande algoritm**
- [ ] 2A — Analysera befintlig data
- [ ] 2B — Designa viktningsmodell
- [ ] 2C — Implementation + "Favoriter"-vy

**Fas 3 — Internationell receptimport**
- [x] 3A — Kartlägg format och sajter — **klart** (`docs/research-internationell-import.md`, Session 28). 7/18 sajter bot-blockerade (Cloudflare: allrecipes, seriouseats, bbcgoodfood, bonappetit, chefkoch, marmiton, foodnetwork). Budgetbytes verifierad med komplett JSON-LD. 5 sajter helt utan JSON-LD (jamieoliver, kochbar.de, essen-und-trinken, giallozafferano ×2) → Gemini-fallback behövs, och den finns redan.
- [ ] 3B — Konverteringsmodul (cups→dl, oz→g, översättning) — research innehåller färdig cheat-sheet + 3 konkreta kodändringar: (1) strip price-annoteringar `$0.17*` från budgetbytes, (2) lägg enhetskonvertering i `GEMINI_SCHEMA_PROMPT`, (3) `postProcessForeignRecipe()` efter `mapJsonLdToRecipe()` för icke-svenska recept
- [ ] 3C — Testa mot 10+ receptsidor

**Fas 4 — Automatisk varukorgsfyllning** (design klar, se `docs/superpowers/specs/2026-04-20-willys-dispatch-design.md`)
- [x] 4A — Teknisk research (PoC verifierade endpoint, auth, CSRF-livslängd)
- [x] 4B — Proof of concept (`scripts/willys-cart-poc.mjs`, session 36)
- [x] 4C — UX-design + felhantering (klar i spec)
- [x] 4D — Implementation **live-verifierad** (Session 39, 2026-04-25). Endpoint `/api/dispatch-to-willys` (GET=featureAvailable, POST=runDispatch). Tre nya shared-moduler: `willys-search.js`, `willys-cart-client.js`, `dispatch-matcher.js`. Full plan: `docs/superpowers/plans/2026-04-23-willys-dispatch.md`. 56 assertions i `tests/dispatch-to-willys.test.js` bevakade av PostToolUse-hook.
- [x] 4E — Söknings-fallback **live-verifierad** (Session 39). Endpoint: `GET https://www.willys.se/search?q=<canon>`, publik. Canon-guard via befintlig `extractOfferCanon` + `CANON_REJECT_PATTERNS` löser vitlök→"Lök Vit"- och grädde→spraygrädde-buggar. Första live-dispatch (Kefir → Arla Cultura Kefir Naturell) lyckades.
- [x] 4F — **Cookie-refresh-automatisering — implementation klar (Session 42, 2026-04-26).** Plan: `docs/superpowers/plans/2026-04-26-cookie-refresh-automation.md`. Chrome-extension fångar passivt cookies + CSRF vid willys.se-besök → POSTar till `/api/cookies/willys` → secret gist på GitHub. `dispatch-to-willys.js` läser via `secrets-store` med 5-min cache, fallback till env vars under övergång. Setup-instruktioner: `extension/README.md`. **Live-verifiering kvar** (kräver gist-skapande + Vercel env vars + extension-install).

**Fas 5 — App Store & monetisering** (marknadsanalys klar → `docs/marknadsanalys-2026-04.md`)
- [x] Marknadsanalys
- [x] 5A — Teknisk väg (PWA / Capacitor / React Native) — **klart** (`docs/research-teknisk-vag-app.md`, Session 28). **Rekommendation: Capacitor** (3–5 veckor). PWA blockas av Apple Guideline 4.2 ("repackaged website") och Safari-eviktion 7d förstör offline på iOS. RN kräver full omskrivning av alla ~11 frontend-moduler (8–16 veckor) — överdrivet för MVP. Capacitor: vanilla ES modules fungerar direkt, enkel build-step + Service Worker + Capacitor Preferences. Slutlig payment-väg (Stripe vs IAP) beror på Fas 5C.
- [ ] 5B — Autentisering & datamodell
- [ ] 5C — Kostnads- och intäktskalkyl

**Fas 6 — Säsongsoptimering** (research + implementation klar, Session 52)
- [x] 6A — Research: säsongstabell (~120 ingredienser × 12 månader) + analys av 264 recept → `docs/research-sasong.md`
- [x] 6B — Taggning: 242/264 recept taggade med `seasons`-fält i `recipes.json`. 22 neutrala (konserverat/fryst-baserade).
- [x] 6C — Algoritm: `applySeasonWeight()` i `selectRecipes()` — in-season 2x, neutral 1x, off-season 0.5x. Opt-in toggle `season_weight` i `/api/generate`.
- [x] 6D — UI: "Säsongsanpassning"-toggle i inställningspanelen + säsongsfilter (vår/sommar/höst/vinter) i receptboken.
- [ ] 6E — Finjustering: eventuell manuell korrigering av säsongstaggar efter användarfeedback.

**Fas 7 — Supabase-migration** (pågående — spec: `docs/superpowers/specs/2026-05-16-supabase-migration-design.md`, PR #29)
- [x] 7A — Förberedelse **klar** (Session 54). Supabase-projekt `receptbok` (ref `zqeznveicagqwblltvsa`, eu-central-1). Vercel-Supabase-integration: 15 nya env vars, 7 gamla orörda. Schema: 10 tabeller + indexer + RLS-policyer. Household "Familjen" (id `71e41d47-0c8e-47c6-83ec-696d256496bf`), owner `joakim.weimar@gmail.com` (user_id `c815432d-f622-4e4d-9e89-362db8941d1e`), magic-link verifierat.
- [x] 7B — Importskript **klar** (Session 55). `scripts/migrate-to-supabase.mjs` med `--dry-run`/`--commit`/`--reset`-lägen. Dry-run validerad: 264 recept + 1 weekly_plan + 28 meal_days (15 plan + 13 custom) + 68 recipe_history + 1 plan_archive + 1 shopping_list + 82 shopping_items + 1 dispatch_preferences. Driftar: stale recipe_id 26 i history skippas, 2 tomma custom-day-entries (2026-05-07/08) skippas. **Live-import väntar till Fas 7E cutover.**
- [ ] 7C — Frontend-omskrivning: `js/supabase-client.js` + ersätt fetch-anrop + login-skärm + realtime
- [ ] 7D — Backend-omskrivning: konsolidera 12 → 5 endpoints, ta bort 7 som flyttas till frontend
- [ ] 7E — Cutover (11-stegs-sekvens) + acceptanskriterier + 15-min-bevakning

### Kända buggar
Inga just nu.

### Öppna utredningar
**Supabase-migration — ⏳ FAS 7C IGÅNG (Session 56, 2026-05-16).** Supabase-klient + magic-link-gate landade. `js/weekly-plan/plan-viewer.js`, `js/shopping/shopping-list.js`, `js/recipes/recipe-editor.js` och `js/recipes/recipe-browser.js` läser fortfarande från JSON-filer — det är nästa step. Spec: `docs/superpowers/specs/2026-05-16-supabase-migration-design.md`. PR: #29 (docs-only).

**Nycklar/IDs att ha för fortsättning:**
- Supabase-projekt ref: `zqeznveicagqwblltvsa` (URL: `https://zqeznveicagqwblltvsa.supabase.co`)
- Household-id: `71e41d47-0c8e-47c6-83ec-696d256496bf` (`Familjen`)
- Owner user-id: `c815432d-f622-4e4d-9e89-362db8941d1e` (`joakim.weimar@gmail.com`)
- Env-vars-snapshot före integration: `docs/superpowers/specs/env-vars-pre-supabase.md`

**TODO i exakt ordning (läs spec först!):**
1. ~~**Fas 7A — Förberedelse**~~ — **klar** (Session 54). Alla 10 substeg gröna.
2. ~~**Fas 7B — Importskript**~~ — **klar** (Session 55). `scripts/migrate-to-supabase.mjs` med tre lägen:
   - `--dry-run` (default): läser JSON, validerar mot schema, loggar planerade INSERTs, skriver INGENTING
   - `--commit`: live-import i ordning recipes → weekly_plans → meal_days → recipe_history → plan_archives → shopping_lists → shopping_items → dispatch_preferences. Validerar radantal + spot-check (5 första/5 sista/10 slump) på recipes.
   - `--reset`: raderar all data i migrationstabellerna (households + household_members orörda). För att kunna köra om importen om något går snett.
   - Kräver `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` som env vars (hämtas från Vercel-dashboard eller Supabase Settings → API).
3. **Fas 7C — Frontend** (största jobbet, ~12–16h):
   a. ~~`js/supabase-client.js` (init + exporterar `db` + `auth`)~~ — **klar** (Session 56). Singleton via CDN-import (`https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm`). Hårdkodad URL + publishable key (`sb_publishable_aB6kIJA9j4fyGZ7Df_GEZQ_rDeHjZ5x`). `getHouseholdId()` cachat.
   b. ~~Login-skärm med magic-link (visas om `auth.getSession()` är null)~~ — **klar** (Session 56). `js/auth-gate.js` exporterar `requireAuth()` som hängande Promise; `app.js` `boot()` awaitar den innan resten initialiseras. CSS i `css/styles.css` (avsnitt "Auth-gate"). PKCE-flow, `detectSessionInUrl: true`.
   c. Ersätt fetch i `js/weekly-plan/plan-viewer.js` + `js/shopping/shopping-list.js` + `js/recipes/recipe-editor.js` + `js/recipes/recipe-browser.js`
   d. Realtime-subscriptions för `meal_days` + `shopping_items` + `recipe_history` (+ cleanup vid render-loops)
4. **Fas 7D — Backend** — konsolidera till 5 endpoints:
   a. Behåll: `api/generate.js`, `api/replace-recipe.js`, `api/discard-plan.js`, `api/import-recipe.js`, `api/dispatch-to-willys.js`, `api/willys-offers.js` (sista oförändrad)
   b. Ta bort: `api/swap-days.js`, `api/skip-day.js`, `api/confirm.js`, `api/custom-days.js`, `api/shopping.js`, `api/recipes.js`
   c. Nytt: `api/_shared/supabase.js` (service-role-klient)
5. **Fas 7E — Cutover** — följ spec sektion 10 exakt (11 steg). STOP-POINT efter steg 8 för GO/NO-GO-beslut innan merge till `main`.
6. **Efter cutover:** uppdatera CLAUDE.md-arkitekturdiagrammet, lägg till Senaste session-entry, vänta 30 dagar innan radering av `docs/legacy/`-duplicater.

**Hård regel:** ALDRIG merge till `main` förrän acceptanskriterier i spec sektion 9 är gröna. ALDRIG `git reset --hard` eller `--force` push utan användarens explicita ja.

**Dishingouthealth-import — ⏸ 197 recept i staging, väntar manuell granskning (Session 45, 2026-05-04).** Plan: `docs/superpowers/plans/2026-05-03-dishingouthealth-scrape.md`. Verktyg i `scripts/dish-scrape/`. 197/551 importerade när Anthropic-krediter tog slut. Kvalitetsrapport: `recipes-import-quality-report.md`. Promotion: `cd scripts/dish-scrape && node promote.mjs`. Återstående 191 obearbetade kan tas via `--resume` efter credit-laddning.

**Cookie-refresh-automatisering (Fas 4F) — ✅ IMPLEMENTATION KLAR** (Session 42, 2026-04-26). Implementation av Session 40-specen via subagent-driven-development (7 tasks). Chrome-extension MV3 + `/api/cookies/willys` + secret gist + dispatch-fallback. Manuell rotation eliminerad i kodvägen — väntar bara på engångs-setup (gist + env vars + extension-install) för att gå live.

**Lexikon- och matchningsaudit — ✅ KLAR** (Session 35, 2026-04-19). Rapport: `docs/match-audit-2026-04-19.md`. Spraygrädde-buggklassen eliminerad via `CANON_REJECT_PATTERNS` + Priority 2-stemming implementerad. 125 → 149 matches, 51 → 53 recept, 0 wrong-function/wrong-product-buggar kvar. 41 regressiontester bevakade av PostToolUse-hook.

**Willys+ medlemserbjudanden — 3-fas utforskning (nu primär öppen utredning):**
- **Fas A — Rekon:** Vilka inloggningsmetoder erbjuder willys.se? BankID? E-post+lösenord? "Kom ihåg mig"-cookies? Mobilapp-OAuth? Claude läser login-sidan.
- **Fas B — Validering:** Hur ser `PERSONAL_SEGMENTED`-svaret faktiskt ut när man är inloggad? Är det 10 extra produkter eller 100 helt andra priser? Kräver att användaren loggar in manuellt på willys.se och hämtar `https://www.willys.se/search/campaigns/online?q=2160&type=PERSONAL_SEGMENTED&page=0&size=500` i devtools och klistrar in svaret. Avgör om Fas C är värd tid.
- **Fas C — Automatiseringsväg** (välj baserat på A+B):
  - Väg 1: Manuell cookie-export → Vercel env var (lätt, skört, cookies går ut efter veckor)
  - Väg 2: Scripted email/password-login (medelsvårt, bara om Willys tillåter lösenord)
  - Väg 3: BankID — **dödsvägen**, ingen lovlig automatisering
  - Väg 4: Acceptera anonyma priser, märk UI:t tydligt ("dina faktiska priser kan vara lägre")

### Idéer (användarens)
*(Inga öppna idéer just nu — Mobil bottom-tab-nav implementerad i Session 41.)*

### Claudes idéer
- Offline-stöd via service worker — appen fungerar utan nät (recepten cachas lokalt, synkar vid anslutning)
- "Veckans vinnare"-vy — familjen röstar på bästa receptet varje vecka, bygger favoritdata

### Senaste session — Session 56 (2026-05-16) — Fas 7C-foundation (Supabase-klient + magic-link-gate)

- **Två nya frontend-moduler:** `js/supabase-client.js` (singleton via `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm`, PKCE-flow, `detectSessionInUrl: true`, `getHouseholdId()` cachat per session) och `js/auth-gate.js` (exporterar `requireAuth()` som returnerar en hängande Promise tills `SIGNED_IN`/`INITIAL_SESSION` triggar). Båda registrerar `window.supabase`/`window.db`/`window.auth`/`window.requireAuth`/`window.signOut` för debugging + framtida konsolanvändning.
- **`app.js`-bootflöde:** Resten av init-sekvensen (recipes-load, render, datepickers, deeplink-tab) wrapas nu i `boot()` som awaitar `requireAuth()` först. Magic-link-mailet skickas med `emailRedirectTo: window.location.origin + window.location.pathname` så preview- och prod-URL:erna båda fungerar utan vidare konfig i Supabase-dashboarden.
- **Supabase Auth URL-config (live-verifierad):** Site URL = `https://receptbok-six.vercel.app`. Redirect URLs allowlistar: `https://receptbok-six.vercel.app/**` + `https://receptbok-six-git-claude-supabase-migration-ihizv-*.vercel.app/**` + `http://localhost:*/**`. Utan dessa hamnade magic-link på `http://localhost:3000` (Supabase fallback till Site URL). Manuell konfig i Supabase-dashboarden krävs eftersom MCP inte exponerar auth-settings.
- **Magic-link-flöde live-verifierat på preview (2026-05-16):** preview-URL → login-gate visas → e-post → mail kommer → klick på länk → tillbaka till preview → session sparas i localStorage → reload visar inte gaten igen.
- **CSS i `styles.css`:** Avsnitt "Auth-gate" — fixerad overlay (z-index 9999), centrerat kort (max 360px), Playfair-Display-rubrik, lichen-fokusring, rust CTA, lichen-deep statusmeddelande, rust-deep felmeddelande. Respekterar safe-area-inset uppe/nere.
- **Cache-bust v=63** på `css/styles.css` och `js/app.js`. **545 assertions oförändrade** (51 match + 62 shopping + 432 select-recipes).
- **Säkerhetsval:** Publishable key `sb_publishable_aB6kIJA9j4fyGZ7Df_GEZQ_rDeHjZ5x` är medvetet hårdkodad i klienten — anon-nivån skyddas av RLS-policies (spec sektion 3). URL `https://zqeznveicagqwblltvsa.supabase.co` likaså. Inga secrets i klientkoden.
- **Vad som INTE är gjort än (rest av Fas 7C):**
  - `js/weekly-plan/plan-viewer.js` — `loadWeeklyPlan()` och alla `fetch('/api/...')`-anrop (swap, skip, custom-days, replace, confirm, discard).
  - `js/shopping/shopping-list.js` — checked-state, manual items, prefs.
  - `js/recipes/recipe-editor.js` — CRUD mot `db.from('recipes')`.
  - `js/recipes/recipe-browser.js` — `init()` i `app.js` laddar fortfarande `recipes.json` via fetch. Behöver ersättas med `db.from('recipes').select('*')`.
  - Realtime-subscriptions för `meal_days` + `shopping_items` + `recipe_history`.
- **Test-impact innan cutover:** Inloggningsgaten blockerar laddning på preview-URL. Live-verifiering klar (se ovan). `api/dispatch-to-willys.js`-flödet rörs inte i denna session.

**Nästa session — Fas 7C steg c (ersätt fetch, ordning lägst→högst risk):**

1. **`recipe-browser.js` + `app.js` `init()`** — laddar bara `recipes.json` idag. Ersätt med `db.from('recipes').select('*').order('id')`. Mappa snake_case → camelCase (`time_note`, `created_at` etc.) i client-mappern så resten av modulerna ser samma format som tidigare. Verifiera att `window.RECIPES` har samma struktur så att `recipe-browser`, `plan-viewer` openWeekRecipe-detaljvy och `selectRecipes`-algoritmen fortsätter fungera. **Risk: låg** — read-only, inga skrivflöden påverkas.
2. **`recipe-editor.js`** — fyra operationer: skapa, uppdatera, ta bort, toggle tested. Ersätt med `db.from('recipes').insert/update/delete()`. `nextId`-strategin från recipes.json behövs inte längre — Postgres genererar via `bigserial` (eller om vi behåller numeriska id:n manuellt så hämta `MAX(id)+1`). **Risk: medel** — felaktig delete kan radera fel rad, men RLS skyddar mot cross-household.
3. **`shopping-list.js`** — flest skriv-anrop. Operationer: toggla checked, lägga till manual items, rensa lista, byta preferences (blocked_brands, prefer_organic, prefer_swedish). Ersätt fetch i `loadShoppingTab`, `setShopMode`, `addManualItem`, `clearShoppingList`, alla `prefs`-handlers. Behåll `shopping-list.json`-läsning som fallback **bara** under utveckling — ta bort innan cutover.
4. **`plan-viewer.js`** — sist eftersom mest invecklat: `loadWeeklyPlan` (läser plan + shop + archive + custom-days), `swapDays`, `skipDay`/`blockDay`/`unblockDay`, `selectRecipeForDay`, `selectRecipeForCustomDay`, `saveCustomDay`, `clearCustomDay`, `confirmPlan`, `discardPlan`, `convertBlockedToCustom`, `replaceRecipe`. **Hård regel:** befintlig veckoplan får aldrig förstöras — extra försiktig med atomic updates och rollback vid fel.
5. **Realtime-subscriptions** — efter att alla fetch är borta. `db.channel()` på `meal_days`, `shopping_items`, `recipe_history`. Lägg cleanup-pattern i `state.js` (`window._activeChannels = []`) så de unsubscribar vid `renderWeeklyPlanData` re-runs.

**Att tänka på under steg 1-4:**
- Importera `db` + `getHouseholdId` från `./supabase-client.js` i varje modul.
- Filtrera alltid på `household_id` i SELECT — RLS sköter säkerhet men explicit filter ger snabbare frågor + tydligare kod.
- Snake_case → camelCase-konvertering centraliseras i en mapper-funktion (`fromRow(row)` / `toRow(obj)`) i `supabase-client.js` eller egen `js/data-mapper.js`. Beslut tas i nästa session.
- Backend (api/generate.js, api/replace-recipe.js etc.) skriver fortfarande till JSON — det är Fas 7D. Under steg 1-4 läser frontend från Supabase, men ingen plan/shop-genereringsflöde fungerar end-to-end förrän 7D är klar. **Det är OK** — testas mot pre-importerad data från Fas 7B (`--commit`-läget körs först vid cutover, så Supabase är fortfarande tom). **Workaround under utveckling:** kör `node scripts/migrate-to-supabase.mjs --commit` mot Supabase nu för att fylla med data, sedan `--reset` innan cutover. Eller manuellt seeda några rader via SQL.

### Session 55 (2026-05-16) — Fas 7B klar (Supabase-importskript)

- **Skript:** `scripts/migrate-to-supabase.mjs` (478 rader) med tre lägen — `--dry-run` (default, ofarligt), `--commit` (live-import via service-role), `--reset` (raderar migrationstabeller, inte households/members). Använder `@supabase/supabase-js` (ny dep, `node_modules/` + `package-lock.json` tillagda i `.gitignore`).
- **Dry-run-validering:** 264 recept + 1 weekly_plan + 28 meal_days (15 plan + 13 custom) + 68 recipe_history + 1 plan_archive + 1 shopping_list + 82 shopping_items + 1 dispatch_preferences.
- **Datadrift-fynd:** (1) `recipe-history.json` har stale id 26 (raderat recept) — skippas med varning, 68/69 importeras (spec sa 67). (2) 2 av 15 custom-day-entries är tomma `{}` (`2026-05-07`, `2026-05-08`) — skippas. (3) Inga blocked/locked-dagar i nuvarande veckoplan.
- **Mappningar:** camelCase→snake_case (`blockedBrands`→`blocked_brands`, `recipeItemsMovedAt`→`recipe_items_moved_at`, `savingMatches`→`saving_matches`, `timeNote`→`time_note`, etc.). `weekly-plan.confirmedAt` → `confirmed_at` (timestamptz). `custom-days.entries{date: {note, recipeId, recipeTitle}}` → `meal_days` med `plan_id = null` + `custom_note`/`recipe_title_snapshot`. Shopping `recipeItems{Category: [...]}` flattas → `shopping_items` med `position` per kategori; `manualItems[]` med `source='manual'` i kategorin Övrigt. `checkedItems` mappas via `recipe::CATEGORY::IDX`/`manual::IDX`-nycklar (oanvänt i nuvarande data).
- **Säkerhetsnät:** `checkPrereqs()` kollar att household finns och att `recipes`-tabellen är tom innan commit. `validate()` jämför radantal post-import + spot-checkar 5 första, 5 sista, 10 slumpvis valda recept fält-för-fält (title/protein/ingredients/instructions). FK-ordning: recipes → weekly_plans (returnerar id) → meal_days → recipe_history → plan_archives → shopping_lists (returnerar id) → shopping_items → dispatch_preferences.
- **Live-import väntar.** Spec section 10 steg 4 — `--commit` körs först vid cutover (Fas 7E), inte nu. Användaren behöver `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` i shellen då (hämtas från Vercel-dashboard eller Supabase Settings → API).
- **Nästa session:** Fas 7C — `js/supabase-client.js` (init + magic-link login-skärm) + ersätt fetch-anrop i `js/weekly-plan/plan-viewer.js`, `js/shopping/shopping-list.js`, `js/recipes/recipe-editor.js`, `js/recipes/recipe-browser.js` + realtime-subscriptions för meal_days/shopping_items/recipe_history.

### Session 54 (2026-05-16) — Fas 7A klar (Supabase-förberedelse)

- **Backup-lager:** branch `backup-data-pre-supabase` (SHA `3d4d190`) + 7 JSON-datafiler kopierade till `docs/legacy/`. Tag `pre-supabase-migration` försökt men sandboxen blockerar tag-push med 403 — branchen täcker samma roll.
- **Env-vars-snapshot:** `docs/superpowers/specs/env-vars-pre-supabase.md`. 7 variabler dokumenterade (4-tecken-signaturer). Tre med värde (`GITHUB_PAT`, `GOOGLE_API_KEY`, `WILLYS_REFRESH_SECRET`), fyra tomma (`GITHUB_GIST_PAT`, `WILLYS_COOKIE`, `WILLYS_CSRF`, `WILLYS_STORE_ID`).
- **Namnupptäckter:** (1) Spec sa `GEMINI_API_KEY`, verklig variabel heter `GOOGLE_API_KEY` (verifierat i `api/import-recipe.js`). (2) `WILLYS_REFRESH_SECRET` är en extra variabel utöver spec-listan (Fas 4F).
- **Säkerhetsvarningar:** `GITHUB_PAT` och `GOOGLE_API_KEY`-värden visades i klartext i skärmdumpar — bör roteras efter Fas 7E.
- **Supabase-projekt:** `receptbok` skapat via MCP, ref `zqeznveicagqwblltvsa`, region `eu-central-1` (Frankfurt). Free-tier, Vercel-Marketplace-org (billing via Vercel).
- **Vercel-Supabase-integration:** Användaren kopplade i Vercel-dashboard. 15 nya env vars tillagda, alla 7 befintliga orörda (R5-skydd höll).
- **Schema (M1):** 10 tabeller skapade — `households`, `household_members`, `recipes`, `weekly_plans`, `meal_days`, `recipe_history`, `plan_archives`, `shopping_lists`, `shopping_items`, `dispatch_preferences` + indexer.
- **RLS (M2):** Enable RLS på alla 10 tabeller + policies per spec-mönster ("household members read/write"). `plan_archives` är write-once (insert + select men inga update/delete-policies). `households` och `household_members` har bara SELECT-policy (skrivning kräver service-role för att förhindra privilege escalation). Säkerhetsadvisor rensad.
- **Seed (1j-a):** `INSERT INTO households (name) VALUES ('Familjen')` → id `71e41d47-0c8e-47c6-83ec-696d256496bf`.
- **Magic-link verifierat (1j-b):** Användaren skickade `Send invitation` från Auth-dashboarden mot `joakim.weimar@gmail.com`, klickade länken, blev `email_confirmed`. user_id `c815432d-f622-4e4d-9e89-362db8941d1e`. Seedad som `owner` i `household_members`.
- **Nästa session:** Fas 7B — bygg `scripts/migrate-to-supabase.mjs` med `--dry-run` och `--commit`-lägen. Läs 7 JSON-filer, mappa camelCase→snake_case (`blockedBrands`→`blocked_brands`, `usedOn`→`used_on`, etc.), importera i FK-ordning. `custom-days.entries{}` mappas till `meal_days` med `plan_id = null` + `custom_note`. Validera radantal efter import.

### Session 53 (2026-05-12) — Kodgranskning + P0-buggfixar

- **Kodgranskning:** 8 parallella Sonnet-agenter granskade hela kodbasen (~7800 JS + 3260 CSS + 510 HTML). 210 fynd totalt: 19 P0 (kritiska), 41 P1, 18 dead code, 24 XSS, 32 inkonsistenser, 36 förbättringar, 40 testtäckning. Rapporter: `docs/review/00-summary.md` + `01`–`08`.
- **P0-fixar (alla 6 buggar + XSS):**
  1. `api/generate.js` — `seasons: r.seasons || []` i fetchRecipes → Fas 6C fungerar nu i produktion
  2. `api/replace-recipe.js` — recipe-history.json uppdateras vid receptbyte (var bruten sedan implementation)
  3. `api/skip-day.js` — saving/savingMatches kopieras vid skip (badges hamnar på rätt dag)
  4. `api/_shared/shopping-builder.js` — `vitlöksklyftor` i Grönsaker-nyckelord (inte Skafferi)
  5. `js/weekly-plan/plan-viewer.js` — swap blockeras på bekräftad plan + null-guard ingredients/instructions + `esc()` på customNote/title/ingredients/instructions/notes
  6. XSS-härdning: ny `escapeHtml()` i `js/utils.js`, applicerad i `renderIngredient`, `renderDetailInner`, `recipe-browser.js` (title i kort+data-attribut), `shopping-list.js` (manuella varor)
- **545 assertions** oförändrade (51 match + 62 shopping + 432 select-recipes).

### Session 52 (2026-05-11) — Fri dag-interaktion + swap bakåt + Säsongsoptimering

- **Fri dag klickbar:** Blockerade dagar i tidslinjen nu klickbara → panel med "Ångra fri dag — skjut ihop matsedeln" (ny `unblock`-action i `api/skip-day.js`) + "Skriv egen notering" (konverterar till custom-day). CSS: cursor pointer + hover på blockerade kort.
- **Swap bakåt i tiden:** Dagsbyte (swap-ikon + "Byt dag"-knapp) tillåts nu på förflutna dagar i aktiv plan. Skip/block döljs fortfarande på förflutna dagar. `data-past`-attribut skiljer ut förflutna från readonly-arkiv.
- **Säsongsoptimering (Fas 6 klar):** Research (`docs/research-sasong.md`) med säsongstabell (~120 ingredienser × 12 månader) + analys av alla 264 recept. 242 recept taggade med `seasons`-fält (vår/sommar/höst/vinter). `applySeasonWeight()` i `selectRecipes()`: in-season 2x, neutral 1x, off-season 0.5x. Opt-in toggle "Säsongsanpassning" i inställningspanelen. Skript: `scripts/season-analysis.mjs`.
- **Säsongsfilter i receptboken:** Ny filtergrupp "Säsong" i filter-sheet med vår/sommar/höst/vinter-checkboxar. Kombineras med alla befintliga filter.
- **545 assertions** (51 match + 62 shopping + 432 select-recipes). Cache-bust v=62.

### Session 51 (2026-05-10) — Fas 1F live-verifierad + Inköpspreferenser + AI-prompt

- **Fas 1F avslutad:** `dry_run`-parameter i `/api/generate` möjliggör torrkörning av hela pipelinen utan att röra veckoplan/inköpslista/historik. Prisoptimeringen (`optimize_prices`) verifierad end-to-end mot live Vercel.
- **Matchningsbuggar fixade:** smör→"Mikropopcorn Smör" och rapsolja→"Sardeller i Olja" eliminerade via utökade `CANON_REJECT_PATTERNS`. Pluralfix (`\w*`-suffix) för svenska böjningsformer. 44→51 assertions i match.test.js.
- **Inköpspreferenser (ny feature):** Varumärkesblocklist (t.ex. undvik Eldorado) + eko/svenskt-toggles per inköpskategori. Sparas i `dispatch-preferences.json` via `api/shopping.js` (actions `get_preferences`/`set_preferences`). Kollapserbar UI-sektion i inköpsfliken. Spec: `docs/superpowers/specs/2026-05-10-dispatch-preferences-design.md`.
- **AI-inköpsprompt:** "Kopiera AI-inköpsprompt"-knapp i inköpsfliken bygger copy-paste-text för Claude in Chrome. Inkluderar varumärkesregler, eko/svenskt-preferenser, 2-sekunders delay-instruktion (Willys registrerar långsamt), och bara oavbockade varor.
- **Vercel 12-funktioner-tak:** `api/dispatch-preferences.js` slog i taket → konsoliderad in i `api/shopping.js` som POST-actions.
- **545 assertions** (51 match + 62 shopping + 432 select-recipes). Cache-bust v=60.

### Session 50 (2026-05-07) — Desktop-tidslinje + taggfilter + Ture-dagar

- **Desktop-anpassning:** Tidslinje bryter ut till full bredd (max 1400px) vid ≥900px via `left:50%; transform:translateX(-50%)`. Fade-gradienter (vänster/höger) med scroll-event-driven `.fade-left`/`.fade-right`.
- **Taggfiltrering:** Dynamiskt genererade tagg-checkboxar i filter-sheet. System-/protein-/kök-taggar exkluderade via `EXCLUDED_TAGS`. Normalisering till lowercase.
- **Fliknamnsbyte:** "Veckans mat" → "Matsedeln" i header-tab, bottom-nav, aria-label.
- **Ture-dagar (barnvänliga recept):** Ny parameter `ture_days` i inställningspanelen. Styr antal dagar med recept taggade "ture". Allokeras före veg-dagar, inga dubbletter. `preferNonTure`-logik i `pick()` sparar ture-recept åt ture-dagar (loops 1–3 undviker ture på vanliga dagar, loops 4–5 släpper igenom som fallback). Bugg hittad och fixad: utan preferNonTure kunde vanliga dagar förbruka alla ture-recept.
- **Ture-helg-bugg:** Alla ture-recept var vardag30 — ture-dag på lördag kraschade. Fix: `processingOrder` sorterar ture-dagar först, `result.sort()` återställer datumordning. Test 16 (30 iter ture-på-helg).
- **Case-bugg:** Taggen "Ture" (versalt) i databasen matchade inte `"ture"` i koden. Fix: `hasTure()` helper med case-insensitiv `.toLowerCase()`-jämförelse.
- **Saknade tidstagger:** 3 ture-recept (id 263, 269, 270) saknade `vardag30`/`helg60` → filtrerades bort. Lade till `vardag30` (alla ≤30 min).
- **Tidig validering:** Om ture_days>0 men inga ture-recept finns i poolen → begripligt felmeddelande istället för kryptiskt "ture helg".
- **Testfixar:** `DEFAULT_CONSTRAINTS` saknades `ture_days: 0` → alla dagar blev ture-dagar. Test 5+7 hade för få icke-veg recept (6 för 7 slots). Test 14 (ture_days=2, 20 iter) + Test 15 (ture_days=0) + Test 16 (ture-på-helg, 30 iter). **432 assertions** (538 totalt: 44 match + 62 shopping + 432 select-recipes).

### Session 49 (2026-05-06) — Buggfix inköpslista runda 3: kategorisering + truncering

- **Kategori-bugg (substring-matching):** `categorize()` använde `low.includes(kw)` → `pankoströbröd` → Mejeri (träff på "ost"), `mangold` → Frukt (träff på "mango"), `asiatisk chili-vitlökssås` → Grönsaker. Fix: ersatt med ordmängd-matchning (`lowWords.has(kw)` för enkelspalts-nyckelord). Flerspalts-nyckelord behåller `includes`.
- **Specifika kategorifixar:** `mangold` tillagd i Grönsaker-nyckelord. `sweet chili` i SKAFFERI_OVERRIDE (matchar "chili" som ord). NORMALIZATION_TABLE: `lacinatokål`→`grönkål`, `fiskbuljongtärningar`→`fiskbuljong`.
- **Trunceringsbugg:** `grönsaks- eller kycklingbuljong` → namn=`grönsaks` pga `endsWith("-")`-grenen strippade bara bindestreck. Fix: hämta basnomen från afterEller-delen → `kycklingbuljong` → normaliseras till `hönsbuljong`. Regex `/\s+\S+-$/` matchar hela prefix+bindestreck.
- **Filtrering:** `salt och svartpeppar efter smak` → `cleanIngredient()` strippade inte "efter smak". Tillagd rad: `s.replace(/\s+efter\s+smak$/i, "")` → landar i PANTRY_ALWAYS_SKIP.
- **62 assertions** oförändrade (106 totalt: 44 match + 62 shopping).

### Session 48 (2026-05-06) — Buggfix inköpslista (doh-mängder) + oprövade-fix
- **Inköpslista doh-mängder:** 5 rotorsaker i `parseIngredient()`/`cleanIngredient()`: (1) slash-bråk `1/2`→`½` etc, (2) ord-gräns ≤2 på qtyPart stoppar `1 litet huvud`/`2 msk + 2 tsk`, (3) decimal-komma i eller-hantering `,.*$`→`,\s+.*$`, (4) float-avrundning `Math.round(x*100)/100`, (5) `nävar`/`huvuden` i SWEDISH_UNITS + `nävar`/`näve` i SMALL_UNITS. 62 assertions.
- **Oprövade recept-gräns:** `untested_count`-limiten respekterades inte i fallback-looparna 2–4 i `pick()` i `api/generate.js` → med 197 oprövade doh-recept i poolen fick nästan alla dagar oprövade recept trots maxinställning. Fix: `underUntestedLimit()`-kontroll i alla loopar; loop 5 som sista utväg. Inline-kopia i `tests/select-recipes.test.js` synkad + nytt test 13. 151 assertions.
- CLAUDE.md komprimerades 434→251 rader (sessionloggar 31–45).

### Session 47 (2026-05-05) — Mobil-verifiering av FAB-stack + safe-area sticky-header-fix
- **Motivering:** Användaren testade FAB-stack-ordning + scroll-lock i bottom-sheets på iPhone Safari. Båda OK. Hittade grafikbugg: receptkort lyste igenom OVANFÖR sticky-sektionsrubriken — exakt 44 px (statusbar/safe-area-zonen).
- **Rotorsak:** `.recipe-section-header` har `top: env(safe-area-inset-top, 0)` → rubriken fastnar vid ~44 px. Gröna toppheadern göms vid scroll (`transform: translateY(-100%)`) och blottar de 44 px — sticky-rubrikens linen-bakgrund täcker inte glipan.
- **Fix-iteration 1 (a0d5d19):** `::before`-pseudo-element med `bottom: 100%; height: env(safe-area-inset-top, 0); background: var(--linen)`. Täckte glipan i sticky-läge — men pseudo-en är `position: absolute` → fanns ALLTID i naturligt flöde → klippte 44 px av föregående sektions sista kort.
- **Fix-iteration 2 (39deaad):** Gate:a `::before` bakom `.stuck`-klass via IntersectionObserver. Observern läser `env(safe-area-inset-top)` via temporär probe-div (CSS env() ej tillgänglig från `getComputedStyle`), sätter `rootMargin: -${safeTopPx+1}px 0px 0px 0px`, togglar `.stuck`. Pseudo-en fade:as med 0.15s opacity. Observern återskapas vid varje `renderRecipeBrowser()`.
- **Filer:** `css/styles.css`, `js/recipes/recipe-browser.js` (`refreshStickyObserver()`), `index.html` (cache-bust v=56→58).
- **Live-verifiering kvar** vid push (användaren sov). Kandidater Session 48: Fas 4F live-verifiering, Capacitor-kickoff (Fas 5A), receptbrowser-finputsning.

### Session 46 (2026-05-04) — Promotion av 197 doh-recept + komplett receptbrowser-refaktor
- **Promotion:** `node scripts/dish-scrape/promote.mjs` med `doh`-tag på alla 197 recept. recipes.json: 62→259, `nextId` 63→262.
- **Group-by** (`js/recipes/recipe-browser.js` — full omskrivning): `GROUP_DEFS` med 5 dimensioner (Kök/Provat-status/Protein/Tid/Typ). Sökning mot `window.RECIPES`-array (inte DOM-attribut — ~MB onödig DOM på 259 kort borttaget). `window.activeFilters` bevarad oanvänd för bakåtkompat med `recipe-editor.js`.
- **Init-bugg:** `countDisplay`-elementet saknades i HTML → `app.js` rad 25 satte `.textContent` → TypeError → varningsruta i stället för listan. Tog bort död referens.
- **Pill-tabs** (ersätter select-dropdown) + notch-säker sticky: `top: env(safe-area-inset-top)` (inte `padding-top: max(...)` — den tog plats även utan fastnad).
- **Bottom-sheets** (Sortera + Filter): scroll-lock via position-fixed-trick (spara scrollY, lås body, återställ) — `overflow:hidden` räcker inte på iOS.
- **FAB-stack** höger nedre: scrolltop + Sortera + Filter. Ordning [scrolltop, openSortBtn, openFilterBtn] — pilen dyker upp ovanför vid scroll>400, Sortera+Filter alltid synliga.
- **65/259 recept kök-taggade** via `scripts/classify-cuisine.mjs`. Specialfall: `/röd\s+curry|grön\s+curry/i` → thai (inte indiskt) — curry-pattern är annars indisk-stämplat.
- **Huvudingrediens-filter** (`mainIngredientOf()` keyword-matchning) ersätter Protein i UI. `protein`-fältet i recipes.json **orört** (matsedeln-algoritmen i `api/generate.js` använder det).
- **Dishing out health-sektion** under Kök: doh-recept utan kök-tag samlas här; doh + cuisine → hamnar i cuisine-sektionen (first-match-wins).
- **Ej gjort:** compact/expand-toggle, sticky-sök, recept-tumnaglar. **Cache-bust:** `?v=56`.

### Session 45 (2026-05-04) — Dishingouthealth-scrape: 197 recept i staging (promoterades i Session 46)
- Verktyg i `scripts/dish-scrape/` (`scrape.mjs`, `promote.mjs`, `finalize.mjs`). 710 sitemap-URLer → 551 kandidater → 197 importerade (Anthropic-krediter slut vid #339).
- Skärpt system-prompt: protein-i-tags förbjudet, 25 prep-method-översättningar, rubriker filtreras. Rating-skip < 4.5 sparar tokens. Recept utan rating släpps igenom.
- **Säkerhetsnät:** `progress.json` (gitignorerad) + `--resume`-flagga. Errors-entries i progress.json måste rensas manuellt för retry.
- **Återstående 191:** Ladda Anthropic-credits ($5), kör `cd scripts/dish-scrape && node scrape.mjs --resume`.

### Session 44 (2026-05-03) — Knapp-harmonisering (fem tiers) + Generera-knapp
- **Geometri:** 8px radie, 1.5px border, font-weight 500, ~38–42px höjd (alla 5 tiers).
- **PRIMARY** (rust filled): `.confirm-plan-btn`, `.btn-save`, `.flytta-btn`, `.shop-dispatch-btn` — alla "commit"-handlingar. **Undantag: `.generate-btn`** → forest (#3d5544), border-radius 14px, solid sparkle-SVG (rust skar sig mot lichen-headern).
- **SECONDARY** (lichen filled): `.btn-import-action`, `.manual-add-btn`
- **OUTLINE** (birch border + forest text): `.replace-recipe-btn`, `.discard-plan-btn`, `.day-action-btn`, `.shop-copy-btn`, `.trigger-toggle-btn`, `.custom-bulk-btn`
- **GHOST/DANGER** (rust-deep text, transparent): `.shop-clear-btn`, `.btn-delete`
- **Visuella skiften att bevaka:** `.trigger-toggle-btn` var capsule → rektangulär. `.replace-recipe-btn` rust-border → birch (kan rullas tillbaka om knappen känns för "tyst" i tidslinjen).
- **Cache-bust-pattern:** `?v=<sessionnummer>` på `css/styles.css` + `js/app.js` i `index.html` — bumpas varje session med CSS/markup-ändringar.

### Session 43 (2026-05-03) — Design-system-migration (Scandi/nature-pivot)
- `:root` skrivet om: 9 gamla tokens (--cream/--terracotta/--sage/--gold m.fl.) → 14 nya (--linen/--lichen/--lichen-deep/--moss-soft/--forest/--rust/--rust-deep/--clay/--birch/--ochre m.fl.). Semantic aliases (--border/--text-muted/--color-success/--color-danger) pekar till nya tokens. Pill-radie 20px → 4px.
- 19 JS inline-style-references med gamla token-namn fixade. Emoji → inline-SVG (`currentColor`, `.icon`-klass 1em). `toggleSettings`-chevron: textContent-swap → `classList.toggle('open')` + CSS-rotation.
- Spec: `docs/superpowers/specs/2026-05-03-design-system-migration-design.md`. **341 assertions passerar oförändrat.**

### Session 42 (2026-04-26) — Fas 4F implementation: cookie-refresh-automation (live-verifierad)
- `api/_shared/secrets-store.js`: gist-backed, 5-min TTL, last-write-wins (Gists API saknar concurrency control).
- Cookie-refresh inmergad i `api/dispatch-to-willys.js?op=refresh-cookies` — **Vercel Hobby = max 12 serverless-funktioner** (var den 13:e, gick inte som separat fil).
- `resolveWillysSecrets`: gist-first, faller tillbaka till env vars. **Fine-grained `GITHUB_PAT` stödjer inte gists → separat `GITHUB_GIST_PAT` (classic PAT).**
- Chrome-extension MV3 (`extension/`): `background.js` fångar CSRF via webRequest, triggar refresh om ≥ 7d sedan. Engångs-setup: `extension/README.md`.
- **341 assertions** (44 match + 62 shopping + 136 select-recipes + 70 dispatch + 29 cookies). Status: live-verifierat, gist-flödet aktivt.

### Session 41 (2026-04-25) — Mobil bottom-tab-navigering
Bottom-nav i footer med 3 Lucide-SVG-ikoner. `data-tab`-attribut, `switchTab` refaktorad till `querySelectorAll('[data-tab]')`. `--bottom-nav-h` CSS-variabel lyfter FAB/scrolltop. `viewport-fit=cover`, `env(safe-area-inset-bottom)`. Lärdom: kort "Ja"-svar tolkades för aggressivt (gömde hela header, inte bara flikarna) → ställ tydligare fråga vid korta svar.

### Session 40 (2026-04-25) — Brainstorming Fas 4F (cookie-refresh-automatisering)
Vald väg: Chrome-extension (passiv cookie-capture vid willys.se-besök). Backend payload klient-agnostiskt `{userId, cookie, csrf, storeId}` för framtida Capacitor-app. Spec: `docs/superpowers/specs/2026-04-25-cookie-refresh-automation-design.md`.

### Session 39 (2026-04-25) — Willys-dispatch live + tre buggfixar
- **Bugg 1 — Manuella tillägg på tom lista:** `loadShoppingTab` returnerade tidigt om `!hasRecipe && !hasManual` och gömde manual-add-inputen. Fix: speglad i `shopNoData` med egna IDs (`*Empty`), `addManualItem(inputId, btnId)` parametriserad.
- **Bugg 2 — Dispatch ignorerade manuella tillägg:** `extractCanonsFromShoppingList` (backend) + `openDispatchConfirm` (frontend) tittade bara på `recipeItems`. Fix: båda läser nu också `manualItems`. (53 → 56 assertions i dispatch-test.)
- **Bugg 3 — kefir saknades som self-canon:** `extractOfferCanon("Kefir Naturell Cultura Laktosfri 2,5%")` → null → no_matches. Fix: `kefir` + varianter som self-canon i NORMALIZATION_TABLE + Mejeri-kategorin. (41 → 44 assertions i match-test.)
- **Första lyckade live-dispatch:** Kefir → Arla Cultura Kefir Naturell i willys.se/cart. **298 assertions** (44+62+136+56).
- **Cookie-utgång:** `axfoodRememberMe` löper ut ca 2026-07-15.

### Session 38 (2026-04-23) — Willys-dispatch implementation (Fas 4D+4E)
Endpoint `api/dispatch-to-willys.js` (named export `runDispatch`), shared-moduler `willys-search.js` / `willys-cart-client.js` / `dispatch-matcher.js`. 4E: publik `GET willys.se/search?q=<canon>`, ingen auth, `code`-fältet matchar `addProducts`-formatet. `matchCanons`: rea-first, sök-fallback. UI feature-flaggad via GET (döljs utan env vars). 53 assertions i `tests/dispatch-to-willys.test.js`. Plan: `docs/superpowers/plans/2026-04-23-willys-dispatch.md`.

### Session 37 (2026-04-20) — Willys cart-API PoC + design-spec
PoC verifierade `POST /axfood/rest/cart/addProducts` (bulk-array). Auth = sessioncookies + långlivad `x-csrf-token` (~3 mån, kan **ej** hämtas programmatiskt utan browser) → manuell cookie+CSRF-export till env vars. Befintlig matcher returnerar **bara reavaror** (`potentialPromotions`-filter) — full täckning kräver 4E-sökning. Spec: `docs/superpowers/specs/2026-04-20-willys-dispatch-design.md`.

### Session 36 (2026-04-20) — Testtäckning shopping-builder + selectRecipes
`tests/shopping.test.js` (62 assertions), `tests/select-recipes.test.js` (136 assertions — **inline-kopia av `selectRecipes`/`bucketBySaving`, synkas manuellt** vid ändringar i `generate.js`). PostToolUse-hooks: `shopping-builder.js` → shopping.test.js, `generate.js` → select-recipes.test.js, blockerar commit vid fel.

### Session 35 (2026-04-19) — Lexikon- och matchningsaudit
125→149 matches, 51→53 recept (85.5%), 8→0 wrong-function-buggar. **CANON_REJECT_PATTERNS**: offer-textregex per canon, eliminerade spraygrädde-buggklassen (grädde/mjölk/smör/fisk). `normalizeName`: adjektiv-strip → token-scan → n-gram-fallback. Nya self-canons: aubergine/gurka/zucchini/paprika/chili/sallad. 41 assertions i `tests/match.test.js`. Rapport: `docs/match-audit-2026-04-19.md`.

### Session 34 (2026-04-18)
Kassera-förslag renderar `data.weeklyPlan` direkt från API-svar (undviker Vercel CDN-race — `?t=Date.now()` räcker inte). Klickbar 💰-badge med `savingMatches[]`-popover. Rea-varning vid end_date > 7 dagar.

### Session 33 (2026-04-18)
Tre-vägs-editor tom dag: välj recept / notering / skapa matsedel. `api/custom-days.js` tar emot `recipeId` + `recipeTitle`. `data-readonly="1"` döljer replace/swap/skip på custom-dag med recept.

### Session 32 (2026-04-18)
Dynamisk tidslinje-horisont (cap 45d). Custom-days: `api/custom-days.js` + `custom-days.json`, notering max 140 tecken, slim-kort 72px. Auto-scroll till planstart vid ny generering. `.plan-pending` + NY-badge. `api/discard-plan.js` tömmer weekly-plan.json + plockar bort recipeIds ur historik.

### Session 31 (2026-04-18)
Tidslinje-polish: `centerTodayCard()` räknar scrollLeft explicit (`scrollIntoView` missar vid `display:none`). `isoWeekNumber()` i `utils.js`. Helg-framhävning.

### Äldre sessioner
Sessioner 8–30 är arkiverade i `docs/session-log-archive.md`. Full git-historik: `git log --oneline`.

## Definition of Done (följ alltid)
Innan "klart" deklareras ska Claude alltid:
1. Läsa tillbaka den editerade filen och verifiera att ändringen landade rätt (Edit-hooken fångar syntaxfel automatiskt)
2. Kontrollera att relaterade funktioner inte brutits — Grep efter berörda funktionsnamn om tveksamt
3. Committa och pusha till `main`
4. Uppdatera Dashboard-sektionen i CLAUDE.md (senaste session, buggar, roadmap-checkboxar)

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

## recipes.json — struktur (rör ej)
```json
{
  "meta": { "version": "1.0", "lastUpdated": "2026-03-08", "totalRecipes": 62, "nextId": 63 },
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
