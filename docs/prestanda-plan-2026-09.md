# Prestanda- och flödesplan — Receptboken (2026-09)

Plan för att göra appen snabbare och mer responsiv och förbättra "flowet" (tiden från tryck till att något syns). Bygger på en kodgenomgång i Session 141 av boot-vägen, flikbyten, mutationer, realtime, backend och leveransen av statiska filer. Fas 0 (mätning) och **Batch E (backend)** är byggda; A–D och F/G återstår.

**Mätstatus:** avsnitt 1 är en kodgenomgång (storlekar och cache-headers uppmätta mot live-deployen med `curl`). **Avsnitt 0.5 är syntetiska siffror** från harnessen och **0.6 är Joakims riktiga iPhone** — det är 0.6 som styr prioriteringen i avsnitt 4. Index-/tabellkontrollen (0.4) är fortfarande ogjord: Supabase Management-API:t svarar `Unauthorized` från molnsessionen.

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

## 2. Fas 0 — mätning ✅ BYGGD (Session 141)

Målet var en baslinje att jämföra mot, så att varje senare batch kan bevisas eller förkastas. Instrumenteringen och harnessen finns nu i koden; Joakims mobilmätning (0.2) och index-kontrollen (0.4) återstår.

### 0.1 Instrumentering i appen ✅
Ny modul **`js/ui/perf.js`**. Helt inert utan flaggan: inga observers registreras, ingen overlay byggs, och `window.perfMark`/`perfSpan` sätts inte ens (anropsställena använder `?.()` och blir no-ops). Slås på med **`?perf=1`**, av med `?perf=0` eller knappen *Stäng av*. Flaggan sparas i `localStorage` — annars går kallstart från hemskärmsikonen inte att mäta, eftersom manifestets `start_url` inte kan bära en query-parameter. Det är en device-lokal diagnostikflagga, inte delat familjeinnehåll.

Mäter: navigation timing (TTFB/DOM/DCL), resource timing (filer + byte), boot-milstolparna `js → auth → hushåll → recept → receptvy → idag → matsedel`, varje Supabase-fråga och `/api/`-anrop (styck + ms), spans för `render:Idag`, `render:Matsedel`, `flik:Inköp`, `flik:Listor`, `flikbyte:*`, samt scroll-jämnhet (bildrutor/hackiga rutor/värsta ruta) och långa uppgifter. Overlayen har **Kopiera** → hela rapporten som text, så siffrorna kan klistras in i en session utan devtools.

Anropsställen (alla minimala): `js/app.js` (milstolpar), och en tunn perf-wrapper runt `renderTodayView`, `renderDeluxe`, `loadShoppingTab`, `loadListsTab` i respektive slice. `window.switchTab` wrappas sent i `boot()` så det YTTERSTA lagret mäts.

### 0.2 Mobilmätning (Joakim, 10 min) — ÅTERSTÅR
Öppna `https://receptbok-six.vercel.app/?perf=1` **en gång** på iPhonen; flaggan sitter kvar, så därefter går det att mäta kallstart från hemskärmsikonen. Tre scenarier, tre gånger vardera, över wifi (det vanliga) och en runda över 4G som kontrast, appen helt stängd emellan:
1. Kallstart → Idag visar kvällens rätt.
2. Flikbyte Idag → Inköp → Matsedel → Recept → Idag.
3. En mutation: "Lägg till på listan" från dag-sheeten → toast.
4. Scrolla Recept-fliken en stund (mäter jank).

Tryck på pillret längst ner → **Kopiera** → klistra in i en session. *Nolla* nollställer räknarna mellan scenarierna. Det här är den enda mätningen som säger sanningen om upplevd hastighet.

### 0.3 Repeterbar lokal mätning ✅
**`node tests/e2e/perf-smoke.mjs`** — kör appen i en riktig webbläsare mot en stubbad Supabase (`tests/e2e/fixtures/supabase-stub.js`, 260 recept + plan + 46 inköpsvaror + listor, datum relativa till idag). Beroendefri statisk server i skriptet; Playwright hämtas från projektet eller den globala installationen. Flaggor: `--browser=webkit`, `--latency=<ms>` (default 120 — modellerar nätverksrundan så seriella kedjor syns), `--json=<fil>`.

Fyra mätscenarier (kallstart, flikrunda, flikrunda igen, varmstart) plus ett **skyddsnät**: appen laddas även *utan* `?perf=1` i en tom kontext och körningen failar om overlayen byggs, om `window.perfMark` finns, om sidan loggar fel eller om något försöker nå riktiga Supabase. Fliktiderna mäts **inifrån sidan** (capture-fas-klick → synlig yta); wall-clock runt Playwrights `click()` dög inte, den innehåller Playwrights egna actionability-väntor och blåste i ett tidigt utkast upp Inköp till 850 ms fast appen var klar på 375 ms.

**WebKit-lanen finns men kan inte köras i molnmiljön** — bara Chromium-binären är förinstallerad, och harnessen avbryter med ett tydligt besked i stället för att ladda ner något. Kör `--browser=webkit` där binären finns; iPhone-sanningen kommer annars från 0.2.

Baslinjen sparas i `docs/snapshots/perf-baseline.json` (`--json=docs/snapshots/perf-baseline.json`).

### 0.4 Datalagret — ÅTERSTÅR (blockerad)
Supabase Management-API:t svarar fortsatt `Unauthorized` från molnsessionen, så index-kontrollen är ogjord. `SUPABASE_ACCESS_TOKEN` behöver förnyas i miljön. Läsande SQL som ska köras: index på `recipes(household_id)`, `meal_days(household_id)`, `meal_days(plan_id)`, `shopping_items(list_id)`, `shopping_lists(household_id, is_active)`, `plan_archives(household_id)`, `household_members(user_id)`, samt storleken på `recipes`-payloaden. Migrationerna skapar bara index för `family_lists`/`family_list_items` och `meal_days.shopping_list_id`.

### 0.5 Baslinje — uppmätt 2026-09-03 (Chromium, stub-latens 120 ms)

Siffrorna är **relativa** (stubbad databas, desktop-CPU) — de jämför commit mot commit. Absolut mobiltid kommer från 0.2.

| Mått | Baslinje | Kommentar |
|---|---|---|
| Databasfrågor vid kallstart | **11** | `household_members, recipes, households, weekly_plans, shopping_lists, plan_archives, meal_days×2, shopping_items, pricing_status, family_lists` |
| Boot-kedjan | js 140 → auth 156 → **hushåll 277 → recept 398** → receptvy 417 → **idag 671** | Fyra tydliga trappsteg à ~120 ms = **fyra seriella nätverksrundor**. Med latens 0 blir hela kedjan 205 ms; med 240 ms blir den 1128 ms — kedjan är alltså nästan helt väntan. |
| Requests vid kallstart | 31 (30 resurser) | Samma vid varmstart — `max-age=0` gör att inget återanvänds |
| DOM-noder efter boot | 4382, varav **Recept-fliken 3405 (78 %)** | Byggs vid boot fast fliken är dold → åtgärd A4 |
| Renderingar vid boot | `render:Idag ×2`, `render:Matsedel ×1` | Dubbelrenderingen av Idag bekräftad → åtgärd A6 |
| Flikbyte Inköp | **385 ms till synligt · 4 frågor** | Tre seriella frågor (14 ms vid latens 0, 374 vid 120, 735 vid 240) |
| Flikbyte Inköp **andra gången** | **382 ms · 4 frågor igen** | Inget återanvänds → precis premissen för åtgärd C1 |
| Övriga flikbyten | 8–29 ms | Matsedel/Recept/Idag renderar ur minnet — de är redan snabba |
| `render:Matsedel` under en flikrunda | **×10** | Tio omrenderingar på fem flikbyten → åtgärd A6/F2 |

**Det mätningen ändrar i planen:** ingenting i prioriteringen — A (boot), C (flikbyten) och B (leverans) står kvar överst, nu med siffror bakom sig. Två saker skärps: A4 är större än väntat (78 % av DOM:en byggs för en dold flik), och Matsedel/Recept/Idag behöver *ingen* renderoptimering (8–29 ms) — F2 nedgraderas till "bara om mobilmätningen säger annat".

### 0.6 Mobilmätning på Joakims iPhone — 2026-09-04 ✅ (Safari, wifi, varm cache)

Den enda mätning som säger sanningen om upplevd hastighet. Rådata i status.md:s verifieringskö.

| Vad | Uppmätt | Tolkning |
|---|---|---|
| **Kallstart → Idag visar middagen** | **2 401 ms** | js 568 → **auth 1402 (+834)** → hushåll 1402 (+0) → recept 2095 (+693) → receptvy 2107 (+12) → idag 2401 (+294) |
| **Tryck → svar (`/api/`-anrop)** | **skip-day 3 478 · dispatch 2 883 · move-day 2 700 · shopping 1 561 ms** | **Värsta siffran i hela mätningen.** Ett tryck på "hoppa över dagen" tar 3,5 sekunder. |
| Auth vid boot | **834 ms**, varav en `/auth/v1/token`-runda på **817 ms** | Access-tokenen (1 h TTL) var utgången → supabase-js förnyar den, och `requireAuth()` väntar in det innan något annat startar. Normalfall, inte kantfall. |
| Recept-hämtningen | 693 ms, och `recipes` frågades **2 gånger** (814 ms totalt) | En hämtning för mycket — ska rotorsakas i Batch A |
| `meal_days` | **12 frågor**, 1 069 ms | Realtidsomladdningen (full `loadWeeklyPlan()` per event) → åtgärd D2 |
| Bygga den dolda Recept-fliken | **12 ms** | Billigt i TID på riktig enhet — A4:s tidsvinst är liten (DOM-storleken kan ändå motivera den) |
| Flikbyte Inköp | 273–414 ms, laddad 2 ggr | Bekräftar Batch C |
| Renderingar | `render:Matsedel ×16`, `render:Idag ×6` | Dubbelrenderingen bekräftad på riktig enhet |
| **Scroll** | **1 349 rutor, 13 hackiga (1 %), värst 45 ms** | **Scrollen är inte ett problem.** Batch F3 avförs som prioritet. |

**Förbehåll:** en mätsession, i Safari (inte installerad PWA), med varm cache (16 kB överfört, 94 filer). API-siffrorna innehåller **Vercel-kallstart** — varje endpoint är en egen funktion och familjens trafik är låg, så första trycket mot varje endpoint betalar full kallstart. Mätningen kan inte skilja kall från varm; det gör den inte mindre sann för familjen, som nästan alltid är den som väcker funktionen.

**Vad mätningen ändrar:**
1. **Backend (Batch E) flyttas från plats 6 till plats 2.** 2,7–3,5 s per tryck är dubbelt så illa som hela kallstarten, och `requireUser`→`getUser` + `getHouseholdId` + kallstart är precis de tre lagren. Detta är den enskilt största vinsten i hela planen.
2. **Auth-rundan blir en egen punkt i Batch A** (ny A7): boot står still i 834 ms på en token-förnyelse innan något ritas. Skelettet (A5) måste därför ritas *före* `requireAuth()`, inte efter.
3. **Dubbelhämtningen av recept** (2 frågor) läggs till i A1.
4. **F3 (scroll/backdrop-filter) avförs** — 99 % av bildrutorna håller budget. Kvar i F bara som städning om något annat ändå rörs.
5. **A4 nedgraderas** från tidsvinst till DOM-hygien (12 ms, inte hundratals).

**Acceptans för Fas 0:** ✅ KLAR — instrumentering + harness i koden, syntetisk baslinje sparad, **mobilmätningen gjord (0.6)**, hela testsviten grön. Kvar bara index-kontrollen (0.4), som är blockerad tills `SUPABASE_ACCESS_TOKEN` förnyas. CI-gating av harnessen tas i Batch B, där CI ändå måste börja bygga.

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
| A4 | *(Nedgraderad efter 0.6: kostar bara 12 ms i tid — motiveras nu av DOM-storlek, inte hastighet.)* **Skjut upp** `renderRecipeBrowser()` + `buildTagFilterUI()` till första gången Recept-fliken öppnas (eller `requestIdleCallback` efter Idag renderats). | `js/app.js`, `js/ui/navigation.js` | Huvudtråden fri för Idag-renderingen; ~260 kort-strängar byggs inte i onödan. |
| A5 | Rendera Idag-vyns **skelett** (datumrad + tom hero med skimmer) direkt vid `DOMContentLoaded`, innan auth ens svarat. | `today-view.js`, `styles.css` | Upplevd start: "appen är igång" på < 300 ms, även om datan tar 1 s. |
| A6 | Ta bort dubbelrenderingen: låt `loadWeeklyPlan`-wrapparna bara sätta flaggor och kör en enda `renderDeluxe()`/`renderTodayView()` efter `renderWeeklyPlanData` (eller gör Idag-renderingen diffad som deluxe). | `plan-viewer-deluxe.js`, `today-view.js` | Halverar renderarbetet per planladdning; mindre fladder. |

| A7 | **Token-förnyelsen blockerar boot** (uppmätt: 834 ms, varav 817 ms `/auth/v1/token`). Rita skelettet (A5) *före* `requireAuth()`, och undersök om plan-/recepthämtningen kan förberedas medan token förnyas. | `js/app.js`, `js/auth-gate.js`, `today-view.js` | Appen ser levande ut under den runda den ändå måste vänta på. |
| A8 | **`recipes` hämtas två gånger** vid en normal session (uppmätt). Rotorsaka och ta bort den ena. | `js/app.js`, `js/recipes/recipe-browser.js` | ~700 ms och en runda mindre. |

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

### Batch E — Backend-overhead per anrop ✅ BYGGD (Session 141d, **D**)

Uppmätt utgångsläge (0.6): `/api/skip-day` 3 478 ms, `dispatch-to-willys` 2 883, `move-day` 2 700, `shopping` 1 561. Varje anrop betalade, i serie, tre saker innan endpointen började arbeta: Vercel-kallstart för just den funktionen, en Auth-runda (`getUser`) och en hushållsfråga.

| # | Åtgärd | Fil(er) | Status |
|---|---|---|---|
| E1 | **Lokal JWT-verifiering.** Ny `api/_shared/auth.js` verifierar signaturen mot projektets publika nyckel (`<SUPABASE_URL>/auth/v1/.well-known/jwks.json`, ES256, publik, cache 600 s). JWKS memoiseras mellan varma anrop. `jose` ^6.2.11 som beroende. **Tar bort en hel nätverksrunda per anrop.** | `api/_shared/auth.js` (ny), `api/_shared/handler.js` | ✅ |
| E2 | **Hushållet memoiseras** i modulscope. "Första hushållet" är en konstant för deployen, så den slås upp en gång per varm lambda i stället för vid varje anrop. Kommentar lämnad om att cachen måste nycklas per användare när backlog #6 (multi-tenant) byggs — `requireUser` lägger redan användaren på `req.user`. | `api/_shared/supabase.js` | ✅ |
| E3 | **Lättare kallstart för `generate.js`:** Willys-modulerna (`willys-offers`, `willys-matcher`) importeras dynamiskt först när `optimize_prices` faktiskt är på. Genereringen är prisagnostisk sedan Session 121, så i normalfallet laddas de aldrig. `deals.js` lämnades orörd — båda dess vägar behöver modulerna, så lazy-laddning hade bara flyttat kostnaden. | `api/generate.js` | ✅ |
| E4 | **`Server-Timing: auth;dur=<ms>`** på alla svar från båda handler-wrapparna → auth-kostnaden blir mätbar utifrån i stället för gissad. | `api/_shared/handler.js` | ✅ |

**Säkerhetshållningen (invariant #4).** Den snabba vägen kan bara SLÄPPA IGENOM, aldrig avvisa på egen hand. Säger den lokala verifieringen "vet inte" — okänd nyckel, JWKS onåbar, annan algoritm, utgånget, fel issuer — faller `requireUser` tillbaka på den gamla `getUser`-vägen, som avgör. Ett fel i snabbvägen kostar därför latens, aldrig åtkomst. `algorithms` är låst till `["ES256","RS256"]`; utan den låsningen kan en angripare signera med HS256 och den publika nyckeln som hemlighet (alg-confusion) och bli godkänd. Issuer kontrolleras mot `SUPABASE_URL` så ett giltigt token från ett annat Supabase-projekt inte duger.

**Känd avvägning — återkallning (funnen i säkerhetsgranskningen).** `getUser` såg levande serverstatus: en raderad, avstängd eller utloggad användares token avvisades direkt. Den lokala vägen är en ren signatur- och utgångskontroll, så ett **återkallat token fortsätter gälla tills det går ut av sig självt** — fönstret är projektets access-token-TTL (Supabase-default 1 h, men en dashboard-inställning som tyst vidgar fönstret om den höjs). Formuleringen "ett fel kostar latens, inte säkerhet" gäller alltså förfalskade tokens, inte återkallade. För familjens tre konton utan självregistrering är avvägningen **accepterad**; två billiga vägar finns om läget ändras: (a) kräv `getUser` på de destruktiva endpointsen (`discard-plan`, `skip-day action:delete`), (b) en liten deny-lista per varm lambda. **Måste omprövas vid M1**, när främmande hushåll registrerar sig och "ta bort medlem" behöver bita omedelbart. *Beslut för Joakim: bekräfta att access-token-TTL:n står på default 1 h i Supabase-dashboarden.*

**Verifiering:** ny `tests/auth-verify.test.js` med 12 fall — giltigt token, utgånget, fel issuer, fel nyckel, **alg-confusion-angreppet**, saknad `sub`, `anon`-roll, skräp/fel typer, `issuerFromEnv`, samt `requireUser` utan header (401), med giltigt token (true + `req.user`) och med ogiltigt token (401 via reservvägen). Hela sviten grön. Dessutom verifierat mot **produktionens riktiga JWKS**: URL:en koden bygger returnerar 200 och projektets kid hittas, så snabbvägen fungerar skarpt (och inte bara i test).

**Kvar att mäta:** effekten syns först skarpt. Kör `?perf=1` igen efter deploy och jämför `/api/`-raden mot 0.6.

### Batch F — Renderkostnad och CSS-hygien (½–1 session, R)

| # | Åtgärd | Fil(er) |
|---|---|---|
| F1 | **Förberäknad sökindex** per recept (`_haystack` = titel+protein+taggar+ingredienser+instruktioner i lowercase, byggd en gång i `recipeFromRow`-steget i `app.js`, inte i mappern) → `matchesSearch` blir en `includes`. | `recipe-browser.js`, `app.js` |
| F2 | Diff-rendering av Idag-vyn per sektion (`setSec`-mönstret från deluxe) så realtime/plan-omladdning inte byter ut hela `#todayView`. | `today-view.js` |
| F3 | ~~CSS-audit på riktig enhet~~ **AVFÖRD efter mätningen (0.6): 99 % av bildrutorna håller budget.** Kvarstår bara som städning om något annat ändå rörs: de 4 `backdrop-filter`-ställena (ersätt med halvtransparent yta på `prefers-reduced-transparency` / äldre Android), `transition: all` på `.po-check svg` → explicita egenskaper, `will-change` bara under pågående animation. | `styles.css` |
| F4 | Stryk den inaktuella status-punkten om död klassisk CSS (den är redan borta) och ta bort de 8 oanvända klasserna (`dlx-day-tag`, `dlx-detail-custom`, `dlx-detail-empty`, `dlx-readonly`, `shop-progress-*`, `toast-error`, `toast-success`) efter manuell koll att de inte sätts dynamiskt. | `styles.css`, `docs/status.md` |
| F5 | (Vid behov efter mätning) dela `styles.css` i kritisk + per-flik-del laddad med `media`/`rel=preload` — bara om Fas 0 visar att CSS-parsning syns i long tasks. | `styles.css`, `index.html` |

### Batch G — Upplevt flöde (½ session, R, efter A–C)

Skelett i stället för spinnrar överallt där data väntas (Inköp, Listor, dag-sheeten när recept hämtas), tryckfeedback inom 100 ms på alla knappar som gör nätverksanrop (`loading`-klassen finns på flera, inte alla), och `aria-busy` på ytor som laddar (löser samtidigt P2-fyndet om `aria-live`). Respekterar `prefers-reduced-motion` som förut.

---

## 4. Ordning, omfång och rollback

**Omprioriterad 2026-09-04 efter mobilmätningen (0.6).** Backend flyttades från plats 6 till plats 2 — 2,7–3,5 s per knapptryck är appens värsta siffra, dubbelt så illa som hela kallstarten.

| Ordning | Batch | Sessioner | Typ | Varför här | Rollback |
|---|---|---|---|---|---|
| 1 | Fas 0 mätning ✅ | 1 | R | Klar | Overlay/harness är additivt |
| 2 | **E backend** ✅ BYGGD (Session 141d) | 1 | D | **3,5 s per tryck** — störst vinst i hela planen | `requireUser`-fallback till `getUser` kvar; revert per endpoint |
| 3 | **A boot** (parallellisering, skelett FÖRE auth, A7 token-rundan, dubbelhämtningen) | 1 | R | 2,4 s till första middagen | Revert av PR; ingen data rörd |
| 4 | C flikbyten | ½ | R | 273–414 ms varje besök på Inköp | Revert |
| 5 | B leverans (byggsteg, självhostad klient, fonter, SW) | 1–1½ | R | 94 filer, `max-age=0` | Revert; SW-bump tvingar ny cache |
| 6 | D mutationer/realtime | 1 | D | 12 `meal_days`-frågor | Revert; svar-kontrakten bakåtkompatibla |
| 7 | F + G rendering/flöde (utan F3) | ½ | R | Scrollen är redan OK — bara render-hygien kvar | Revert |

Total: **6–7 sessioner**. Batch E ensam bör ta ett tryck från 3,5 s till under 1 s.

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
