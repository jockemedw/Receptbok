# Prestanda- och flödesplan — Receptboken (2026-09)

Plan för att göra appen snabbare och mer responsiv och förbättra "flowet" (tiden från tryck till att något syns). Bygger på en kodgenomgång i Session 141 av boot-vägen, flikbyten, mutationer, realtime, backend och leveransen av statiska filer. Inget är ännu ändrat i koden — det här är analys + prioriterad åtgärdslista med beslutspunkter.

**Läs först: vad som INTE mättes.** Ingen mätning är gjord på en riktig mobil (Joakim har ingen lokal miljö, och molnsessionen kan inte logga in i appen). Storlekar, cache-headers och nätverksvattenfall är uppmätta mot live-deployen med `curl`; antalet databasfrågor är räknat i koden. Alla "förväntad effekt"-uppskattningar nedan är just uppskattningar tills Fas 0 ger siffror. Supabase Management-API:t svarade `Unauthorized` i sessionen, så index-/tabellkontrollen (Fas 0.4) är ogjord.

---

## 1. Diagnos — var tiden går idag

### 1.1 Kallstart på mobil (öppna appen → Idag-fliken visar kvällens middag)

Kedjan är i praktiken **seriell i fem nätverkssteg** innan startfliken visar något alls:

| Steg | Vad | Fil | Kommentar |
|---|---|---|---|
| 1 | `index.html` (41 KB) | `service-worker.js` | Navigering är *alltid nät-först utan timeout*. På dåligt nät väntar appen på nätet tills fetch failar innan cachen används. `Cache-Control: max-age=0, must-revalidate`, `x-vercel-cache: MISS`. |
| 2 | `css/styles.css?v=196` (205 KB, 43 KB gz) + Google Fonts-CSS | `index.html` | Båda renderblockerande. Font-CSS:en listar **20 `src`-poster** (8 vikter × subset). |
| 3 | `js/app.js?v=158` → 26 moduler utan `?v=` → `utils.js` | `js/app.js` | 27 egna filer (468 KB, 129 KB gz), 2–3 nivåers importdjup. SW:n hämtar dem **nät-först varje gång** (medvetet — se kommentaren i SW:n), och Vercel svarar `max-age=0` → 27 villkorliga requests per start. |
| 3b | `@supabase/supabase-js@2/+esm` från jsdelivr | `js/supabase-client.js` | `+esm` splittrar i **8 filer i 3 nivåer** (supabase → auth-js → tslib; realtime → phoenix …), ca 170 KB. `modulepreload` täcker bara toppfilen → vattenfall. |
| 4 | `recipes select *` (alla recept inkl. instruktioner) | `js/app.js` `init()` | Måste bli klar innan **något** renderas. Dessutom byggs hela receptbrowsern (`renderRecipeBrowser`) och taggfiltret här, trots att Recept-fliken är dold vid start. |
| 5 | `loadWeeklyPlan`: 4 parallella hämtningar varav två har ett **inbäddat andra steg** (`weekly_plans` → `meal_days`, `shopping_lists` → `shopping_items`) | `js/weekly-plan/plan-viewer.js` | Först här får Idag-vyn data. Därefter ytterligare två frågor (`pricing_status`, fästa lappar) från `today-view.js`. |

Summa: **minst 4 seriella nätverksrundor mot Supabase + 9 frågor** innan Idag är komplett, ovanpå asset-vattenfallet. På 4G med 100–250 ms per runda är det lätt 1–2 s "bara väntan" efter att JS:en kört.

Två renderingsdetaljer förstärker det: `renderWeeklyPlanData` är wrappad av både `plan-viewer-deluxe.js` och `today-view.js`, och `loadWeeklyPlan` är wrappad av båda igen → **varje planladdning renderar Matsedel + Idag två gånger vardera**. Deluxe har dag-diff (`renderDaysDiff`), Idag-vyn skriver `innerHTML` rakt av.

### 1.2 Flikbyte

- **Inköp:** `switchTab('shop')` → `loadShoppingTab()` **varje gång**, som börjar med att dölja innehållet och visa spinnern, sedan 4 frågor (`shopping_lists`, `pantry_items`, `shopping_items`, `meal_days`-täckning) och `initDispatchUI()`. Det är den tydligaste "flow"-bristen: fliken blinkar till laddning även när inget ändrats.
- **Listor:** `loadListsTab()` → `refreshData()` varje gång, men behåller befintlig markup under tiden (bättre mönster).
- **Recept:** redan renderad vid boot (kostnaden betalas på fel ställe, se 1.1).
- **Matsedel/Idag:** rena omrenderingar ur minnet — bra.

### 1.3 Mutationer (tryck → uppdaterad vy)

- **Bra mönster finns:** `dlxShuffle`, `dlxFreeDay` m.fl. använder API-svaret (`data.weeklyPlan`/`shoppingList`) och renderar direkt, utan omhämtning. Bockning i inköpslistan är optimistisk med 600 ms batchad flush.
- **Dåliga mönster:** `sheetListAction` (lägg till/ta bort dag på listan) kör `loadShoppingTab()` **och** `await loadWeeklyPlan()` → 10 frågor + två spinnrar innan toasten. `day-picker.js` likaså.
- **Realtime:** `meal_days`-kanalen svarar med **full `loadWeeklyPlan()`** (6 frågor) på varje event; `shopping_items`-kanalen kör full omladdning vid INSERT. Eko från egna skrivningar dämpas med tidsfönster (`_planMutateUntil`, 4 s) — fungerar, men är en kapplöpning.

### 1.4 Backend-latens per API-anrop (`api/`)

Varje anrop betalar, i serie, innan själva arbetet börjar:

1. **Vercel-kallstart** för just den funktionen (12 separata funktioner, var och en importerar `@supabase/supabase-js` på toppnivå; `generate.js` importerar dessutom Willys-modulerna alltid).
2. `requireUser` → `db.auth.getUser(token)` = **en nätverksrunda till Supabase Auth** bara för att verifiera JWT:n (`api/_shared/handler.js`).
3. `getHouseholdId()` → **ännu en fråga** (`households limit 1`, `api/_shared/supabase.js`) — trots att hushållet redan är känt i klienten och kan härledas från token.

Det är 200–500 ms overhead per anrop innan `/api/skip-day` ens rört `meal_days`. Vid kallstart mer.

### 1.5 Rendering och CSS

- `styles.css`: 7 062 rader, 137 `transition`, 76 `box-shadow`, 19 `@keyframes`, 4 `backdrop-filter`, 3 `prefers-reduced-motion`-block, 1 `transition: all` (`.po-check svg`). Den döda klassiska veckovy-CSS:en som status.md nämner är **redan borta** (0 träffar på `.week-day-card`/`.timeline-`/`.plan-group`) — status-punkten är inaktuell. Grov klassaudit hittade bara 8 oanvända klasser.
- Receptbrowsern bygger om hela gridet som en `innerHTML`-sträng per sökning (debounce 140 ms) och kör `toLowerCase()` på titel, taggar, ingredienser **och instruktioner** för varje recept per tangent. `content-visibility: auto` på korten finns redan (Session 121).
- `backdrop-filter` är dyr på äldre Android — fyra ställen att granska på riktig enhet.

### 1.6 Service worker och cache-strategi

- Precache-listan pekar på `styles.css?v=193` medan `index.html` använder `v=196` → installationen laddar ner en CSS som aldrig används, och offline-fallbacken saknar rätt version.
- Nät-först utan timeout för navigering och alla JS-moduler betyder att SW:n idag **inte ger snabbare start**, bara offline-fallback. Det är ett medvetet val eftersom modulerna saknar `?v=` (Session 101-kraschen). Roten är versionsstrategin, inte SW:n — se beslut B1.

---

## 2. Fas 0 — mätning (1 session, render-only)

Målet är en baslinje att jämföra mot, så att varje senare batch kan bevisas eller förkastas. Utan detta blir "känns snabbare" den enda måttstocken.

### 0.1 Instrumentering i appen (billig, permanent)
`performance.mark()`/`measure()` i boot-kedjan: `boot:start`, `auth:ok`, `recipes:loaded`, `plan:loaded`, `today:first-render`, `today:complete`, samt mark/measure runt `loadShoppingTab`, `loadListsTab`, varje `apiFetch` (path + ms) och varje `renderDeluxe`/`renderTodayView`. Aktiveras med `?perf=1` och skrivs som `console.table` + en liten overlay-ruta längst ner (så Joakim kan läsa den på mobilen utan devtools). Filer: `js/app.js`, `js/supabase-client.js`, `js/ui/`-hjälpare (ny `perf.js`, ~40 rader).

### 0.2 Mobilmätning (Joakim, 10 min)
Tre scenarier, tre gånger vardera, på iPhone över wifi (den vanliga situationen) och en gång över 4G som kontrast, appen helt stängd emellan:
1. Kallstart → Idag visar kvällens rätt.
2. Flikbyte Idag → Inköp → Matsedel → Recept → Idag.
3. En mutation: "Lägg till på listan" från dag-sheeten → toast.
Läs av overlayen och skriv siffrorna i verifieringskön. Det här är den enda mätningen som säger sanningen om upplevd hastighet.

### 0.3 Repeterbar lokal mätning (Claude)
En Playwright-harness `tests/e2e/perf-smoke.mjs` som kör appen i headless Chromium mot **stubbad Supabase** (route-intercept av `*.supabase.co/rest/v1/*` och `/auth/v1/*` med sparad exempeldata) och rapporterar: antal requests, total överförd mängd, `performance.measure`-värdena ovan, long tasks > 50 ms, DOM-noder per flik. Körs med `node tests/e2e/perf-smoke.mjs` (samma "inga npm-scripts"-princip). Ger reproducerbara *relativa* siffror mellan commits, inte absolut mobiltid. Harnessen körs i både Chromium och WebKit (Playwright) eftersom familjens huvudenhet är iPhone. Lighthouse mot produktion utgår (beslut B4: inget testkonto).

### 0.4 Datalagret (Claude, när Management-API-tokenen fungerar)
Läsande SQL: index på `recipes(household_id)`, `meal_days(household_id)`, `meal_days(plan_id)`, `shopping_items(list_id)`, `shopping_lists(household_id, is_active)`, `plan_archives(household_id)`, `household_members(user_id)`, samt storleken på `recipes`-payloaden (`select *` idag). Migrationerna skapar bara index för `family_lists`/`family_list_items` och `meal_days.shopping_list_id` — övriga tabeller förlitar sig på vad Supabase-seeden råkade skapa. Saknas de är det en billig, idempotent migration (DDL → Joakims OK).

**Acceptans för Fas 0:** baslinjesiffror i status.md för de tre scenarierna + harness grön i CI.

---

## 3. Optimeringar — prioriterade batchar

Ordningen är vald efter (förväntad effekt × sannolikhet att den märks på mobilen) / risk. Varje punkt är märkt **R** (render-only) eller **D** (datamuterande / rör dataflöden — testas mot hela sviten). Invarianter: ingen batch rör receptstrukturen (#2), veckoplanen som data (#1) eller lägger till en API-fil (#3).

### Batch A — Boot-vägen: från seriell kedja till parallell (1 session, R)

Störst effekt på kallstarten, lägst risk, inga schemaändringar.

| # | Åtgärd | Fil(er) | Förväntad effekt |
|---|---|---|---|
| A1 | Starta `loadWeeklyPlan()` **parallellt** med receptladdningen i `boot()` (båda behöver bara `householdId`). Idag-vyn renderar när planen finns; receptnamn/tider fylls på när recepten kommit (`recipeById` returnerar redan `null`-säkert). | `js/app.js` | Tar bort en hel nätverksrunda från kritiska vägen. |
| A2 | **Bädda in** andra steget i PostgREST-frågan: `weekly_plans` med `meal_days(*)` och `shopping_lists` med `shopping_items(...)` i samma request (kräver att FK:erna `meal_days.plan_id → weekly_plans.id` och `shopping_items.list_id → shopping_lists.id` finns — verifieras i Fas 0.4; annars behåll två steg). | `plan-viewer.js` `loadActivePlanFromSupabase`, `loadShopSummaryFromSupabase` | Två rundor → en. |
| A3 | Flytta `pricing_status` + fästa lappar in i samma `Promise.all` som planen i stället för "efter". | `today-view.js`, `plan-viewer.js` | En runda mindre efter första render. |
| A4 | **Skjut upp** `renderRecipeBrowser()` + `buildTagFilterUI()` till första gången Recept-fliken öppnas (eller `requestIdleCallback` efter Idag renderats). | `js/app.js`, `js/ui/navigation.js` | Huvudtråden fri för Idag-renderingen; ~260 kort-strängar byggs inte i onödan. |
| A5 | Rendera Idag-vyns **skelett** (datumrad + tom hero med skimmer) direkt vid `DOMContentLoaded`, innan auth ens svarat. | `today-view.js`, `styles.css` | Upplevd start: "appen är igång" på < 300 ms, även om datan tar 1 s. |
| A6 | Ta bort dubbelrenderingen: låt `loadWeeklyPlan`-wrapparna bara sätta flaggor och kör en enda `renderDeluxe()`/`renderTodayView()` efter `renderWeeklyPlanData` (eller gör Idag-renderingen diffad som deluxe). | `plan-viewer-deluxe.js`, `today-view.js` | Halverar renderarbetet per planladdning; mindre fladder. |

**Verifiering:** hela sviten grön, Playwright-harness visar färre requests/kortare `today:complete`, mobilkoll av scenario 1. Versionsbump app+SW.

### Batch B — Leverans av statiska filer (1 session + beslut B1, R)

| # | Åtgärd | Fil(er) | Kommentar |
|---|---|---|---|
| B1 | **Versionera modulerna** så de kan cachas hårt. Två vägar (beslut): (a) minimal byggsteg med `esbuild` i Vercels `buildCommand` som bundlar `js/app.js` → `dist/app.[hash].js` och skriver in hashen i `index.html`; SW:n blir cache-först på hashade filer. (b) Behåll no-build: `importmap` i `index.html` som mappar alla 27 modulspecifierare till `?v=N`-URL:er, och en `vercel.json`-headers-regel med `immutable` för allt med `?v=`. Rekommendation: **(a)** — en request i stället för 27, borttagen versionsbump-ritual (hashen sköter det), och SW:n kan äntligen ge snabbstart. Kostnad: ett `package.json`-devberoende och en ändrad deploykonvention (CLAUDE.md-uppdatering). | `vercel.json`, `index.html`, `service-worker.js`, ev. `build.mjs` | Största enskilda vinsten på återbesök. |
| B2 | **Självhosta Supabase-klienten** som en enda förbundlad ESM-fil i `vendor/` (pinnad version, samma esbuild-steg eller engångskopia). Tar bort 8-filers CDN-vattenfall + tredjepartsberoende i runtime. | `js/supabase-client.js`, `vendor/` | ~3 rundor mindre vid kallstart. |
| B3 | **Fonter:** skär vikterna till de som faktiskt används (grep i CSS: troligen 400/600/700 display + 400/500/600 body → 8 → 5–6), självhosta woff2 med `font-display: swap` och `<link rel=preload>` på de två som syns above-the-fold. | `index.html`, `styles.css`, `fonts/` | Bort med renderblockerande tredjeparts-CSS; färre nedladdningar. |
| B4 | **Service worker:** rätta precache-versionen (v193 → aktuell), lägg **timeout (≈2,5 s)** på nät-först-navigeringen med fallback till cachat skal, cache-först för hashade/versionerade filer efter B1. | `service-worker.js` | Snabb start på dåligt nät; offline-fallback som faktiskt matchar. |
| B5 | `vercel.json`: `Cache-Control: public, max-age=31536000, immutable` för `/dist/*`, `/vendor/*`, `/fonts/*`, `/icons/*`; oförändrat (`must-revalidate`) för `index.html` och SW:n. | `vercel.json` | Noll requests för assets på återbesök. |

**Verifiering:** harness visar requestantal ≈ 5 vid varmstart; mobilkoll scenario 1 två gånger i rad (andra gången ska vara märkbart snabbare).

### Batch C — Flikbyten utan spinner (½ session, R)

| # | Åtgärd | Fil(er) |
|---|---|---|
| C1 | **Stale-while-revalidate i minnet** för Inköp: om `_shopListId` och renderad lista finns → visa den direkt, hämta om i bakgrunden och diff-rendera vid skillnad (samma idé som `applyRemoteUpdate`). Spinnern bara första gången. | `shopping-list.js` `loadShoppingTab` |
| C2 | **Förhämta** Inköp- och Listor-data i `requestIdleCallback` efter att Idag renderats (de är 4 + 2 frågor, redan hushållsskopade), så första flikbytet också är momentant. | `js/app.js` |
| C3 | `initDispatchUI()` bara en gång, inte per laddning. | `shopping-list.js`, `dispatch-ui.js` |
| C4 | Lätta tonings-övergångar mellan flikar finns redan (Session 120) — behåll; kontrollera att skelett/innehållsbyte inte ger layout-hopp (CLS) när `body.paddingTop` sätts av `ResizeObserver` i `scroll.js`. | `styles.css`, `scroll.js` |

### Batch D — Mutationer och realtime: använd svaret, hämta inte om (1 session, **D**)

| # | Åtgärd | Fil(er) | Risk |
|---|---|---|---|
| D1 | `POST /api/shopping` (`add_day`/`remove_day`/`set_days`) returnerar redan/kan returnera täckningsraderna + listan → `sheetListAction` och `day-picker.js` renderar från svaret (som `dlxShuffle` gör) i stället för `loadShoppingTab()` + `loadWeeklyPlan()`. | `api/shopping.js`, `api/_shared/shopping-store.js`, `plan-viewer-deluxe.js`, `day-picker.js` | Medel — rör svar-kontraktet; tester i `shopping-store.test.js`, `plan-orchestration.test.js`. |
| D2 | Realtime `meal_days`: hantera UPDATE på plats (raden bär allt som behövs), hämta bara om vid INSERT/DELETE, och **bara `meal_days`** (inte arkiv, inte lista) — de andra tabellerna har egna kanaler eller ändras inte av eventet. | `plan-viewer.js` `subscribeMealDays` | Låg–medel; mönstret finns redan i inköpslistan. |
| D3 | Realtime `shopping_items` INSERT: lägg till raden på plats i stället för full omladdning. | `shopping-list.js` | Låg. |
| D4 | Ersätt tidsfönstret `_planMutateUntil` med **rad-nivå-eko-dämpning** (jämför `updated_at`/värden som `lists-view.js` gör) när D2 är på plats. | `plan-viewer.js` | Låg. |

**Verifiering:** hela sviten + ett nytt testblock per ändrat svar-kontrakt; två-telefoners realtime-koll (finns redan i kön, F287).

### Batch E — Backend-overhead per anrop (1 session, **D**)

| # | Åtgärd | Fil(er) | Kommentar |
|---|---|---|---|
| E1 | **Lokal JWT-verifiering** i `requireUser` i stället för `auth.getUser()`-rundan: verifiera signaturen mot projektets JWKS (`/auth/v1/.well-known/jwks.json`, cachad i modulminnet) eller JWT-secret via `jose`. Fail-closed som idag; `getUser` som fallback vid okänd `kid`. | `api/_shared/handler.js` | Sparar en nätverksrunda per anrop. Beslut B3 (nytt beroende `jose`, eller `crypto.subtle` utan beroende). |
| E2 | **Hushåll ur token:** `getHouseholdId(userId)` slår `household_members` (indexerad, se 0.4) och cachas per `sub` i modulminnet (TTL några minuter). Löser samtidigt "första hushållet"-bristen (backlog #6) i förbifarten — eller förbered den utan att ändra beteendet för hushåll #1. | `api/_shared/supabase.js` | Rör alla endpoints → hela sviten. |
| E3 | **Kallstartsvikt:** dynamisk `import()` av Willys-/Axfood-modulerna i `generate.js` och `deals.js` bara när reor faktiskt hämtas; kontrollera att inga endpoints importerar `dispatch`-klienterna i onödan. | `api/generate.js`, `api/deals.js` | Mindre bundle per funktion → snabbare kallstart. |
| E4 | Mät i Fas 0: lägg `Server-Timing`-header (`auth;dur=…`, `db;dur=…`) i handlern så klientens perf-overlay kan visa backendens del. | `api/_shared/handler.js` | Render-only på klienten, header-only på servern. |

### Batch F — Renderkostnad och CSS-hygien (½–1 session, R)

| # | Åtgärd | Fil(er) |
|---|---|---|
| F1 | **Förberäknad sökindex** per recept (`_haystack` = titel+protein+taggar+ingredienser+instruktioner i lowercase, byggd en gång i `recipeFromRow`-steget i `app.js`, inte i mappern) → `matchesSearch` blir en `includes`. | `recipe-browser.js`, `app.js` |
| F2 | Diff-rendering av Idag-vyn per sektion (`setSec`-mönstret från deluxe) så realtime/plan-omladdning inte byter ut hela `#todayView`. | `today-view.js` |
| F3 | CSS-audit på riktig enhet: de 4 `backdrop-filter`-ställena (ersätt med halvtransparent yta på `prefers-reduced-transparency` / äldre Android), `transition: all` på `.po-check svg` → explicita egenskaper, `will-change` bara under pågående animation. | `styles.css` |
| F4 | Stryk den inaktuella status-punkten om död klassisk CSS (den är redan borta) och ta bort de 8 oanvända klasserna (`dlx-day-tag`, `dlx-detail-custom`, `dlx-detail-empty`, `dlx-readonly`, `shop-progress-*`, `toast-error`, `toast-success`) efter manuell koll att de inte sätts dynamiskt. | `styles.css`, `docs/status.md` |
| F5 | (Vid behov efter mätning) dela `styles.css` i kritisk + per-flik-del laddad med `media`/`rel=preload` — bara om Fas 0 visar att CSS-parsning syns i long tasks. | `styles.css`, `index.html` |

### Batch G — Upplevt flöde (½ session, R, efter A–C)

Skelett i stället för spinnrar överallt där data väntas (Inköp, Listor, dag-sheeten när recept hämtas), tryckfeedback inom 100 ms på alla knappar som gör nätverksanrop (`loading`-klassen finns på flera, inte alla), och `aria-busy` på ytor som laddar (löser samtidigt P2-fyndet om `aria-live`). Respekterar `prefers-reduced-motion` som förut.

---

## 4. Ordning, omfång och rollback

| Ordning | Batch | Sessioner | Typ | Rollback |
|---|---|---|---|---|
| 1 | Fas 0 mätning | 1 | R | Overlay/harness är additivt |
| 2 | A boot-parallellisering | 1 | R | Revert av PR; ingen data rörd |
| 3 | C flikbyten | ½ | R | Revert |
| 4 | B leverans (efter beslut B1–B2) | 1–1½ | R | Revert; SW-versionsbump tvingar ny cache |
| 5 | D mutationer/realtime | 1 | D | Revert; svar-kontrakten bakåtkompatibla (nya fält, inga borttagna) |
| 6 | E backend | 1 | D | `requireUser`-fallback till `getUser` kvar; revert per endpoint |
| 7 | F + G rendering/flöde | 1 | R | Revert |

Total: **7–8 sessioner**. Batch A + C ger sannolikt den största märkbara skillnaden per timme och kan gå live redan efter session 2–3.

---

## 5. Beslut — tagna av Joakim 2026-09-03 (intervju i Session 141)

| Beslut | Utfall | Konsekvens för planen |
|---|---|---|
| **B1 Byggsteg** | **Ja — esbuild-bundling** till hashad fil. | Batch B1 väg (a). Nytt `package.json`-devberoende, `buildCommand` i `vercel.json`, SW cache-först på hashade filer, versionsbump-ritualen försvinner (CLAUDE.md uppdateras när det är live). CI-workflowen ska köra bygget så en trasig bundle fångas före deploy. |
| **B2 Supabase-klient** | **Ja — självhosta** pinnad version i `vendor/`. | Batch B2. Uppdateras manuellt; versionen loggas i status.md. |
| **B3 JWT-verifiering** | **`jose` som beroende**, `getUser` kvar som fallback vid okänd `kid`. | Batch E1. |
| **B4 Mätning** | **Stubbad Supabase + Joakims mobilsiffror.** Inget testkonto i produktion. | Fas 0.3 harness byggs; Lighthouse mot live utgår. |
| **B5 Index-migration** | Öppet — avgörs av Fas 0.4 när Management-API-tokenen fungerar. | DDL bara på uttryckligt OK, som alltid. |
| **B6 Lazy-ladda instruktioner** | **Nej** — sökningen i instruktionstext behålls. | Boot-payloaden mäts men rörs inte. |
| **Start** | **Fas 0 mätning först**, i nästa session. | Ingen batch byggs utan baslinje. |

**Joakims upplevelse (styr prioriteringen):** *allt fyra* känns segt — kallstart, flikbyten, tryck→svar och scroll/animationer. Mest använd enhet: **iPhone på wifi**. Det betyder att Fas 0.2 mäts primärt på iPhone/Safari över wifi (plus en 4G-runda som kontrast), och att Batch F3 (backdrop-filter, transitions) inte kan avfärdas som "bara Android" — Safari-profilen i harnessen (WebKit i Playwright) ska ingå.

## 6. Antaganden (explicita)

1. Familjen öppnar appen som PWA på mobil över 4G/wifi; kallstart och flikbyten är de dominerande upplevelserna, inte långa sessioner.
2. Supabase-latensen från Sverige är 80–250 ms per runda; Vercel-funktionerna kallstartar ofta eftersom trafiken är låg.
3. Antalet recept (~260) och planrader är små — datamängd är inte problemet, antalet seriella rundor är det.
4. Ingen ny driftskostnad accepteras (allt ovan är gratis-tier-kompatibelt).
5. Ingen AI i runtime, ingen automatisk generering — inget i planen rör det.
