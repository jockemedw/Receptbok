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
- [x] 4F — Cookie-refresh-automatisering klar (Session 42). Chrome-extension MV3 → secret gist → `secrets-store` (5-min cache). **Engångs-setup kvar** (se Öppna utredningar).

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

### Kända buggar
Inga just nu.

### Öppna utredningar
**Cookie-refresh-automatisering (Fas 4F) — ✅ IMPLEMENTATION KLAR, ⏳ ENGÅNGS-SETUP KVAR** (Session 42, 2026-04-26). Chrome-extension MV3 + `/api/cookies/willys` + secret gist + dispatch-fallback. Väntar på: (1) skapa secret gist, (2) sätt `GITHUB_GIST_PAT` + gist-ID i Vercel env vars, (3) installera extensionen i Chrome. Instruktioner: `extension/README.md`.

**Willys+ medlemserbjudanden — 3-fas utforskning:**
- **Fas A — Rekon:** Vilka inloggningsmetoder erbjuder willys.se? BankID? E-post+lösenord? "Kom ihåg mig"-cookies? Mobilapp-OAuth?
- **Fas B — Validering:** Logga in manuellt, hämta `https://www.willys.se/search/campaigns/online?q=2160&type=PERSONAL_SEGMENTED&page=0&size=500` i devtools och klistra in svaret. Avgör om Fas C är värd tid.
- **Fas C — Automatiseringsväg:** Väg 1: manuell cookie-export (lätt, skört). Väg 2: scripted login (medelsvårt). Väg 3: BankID — dödsvägen. Väg 4: acceptera anonyma priser, märk UI:t.

### Idéer (användarens)
*(Inga öppna idéer just nu — Mobil bottom-tab-nav implementerad i Session 41.)*

### Claudes idéer
- Offline-stöd via service worker — appen fungerar utan nät (recepten cachas lokalt, synkar vid anslutning)
- "Veckans vinnare"-vy — familjen röstar på bästa receptet varje vecka, bygger favoritdata

### Senaste session — Session 71 (2026-06-02) — "Gör fri dag" / "Ångra fri dag" (free/unfree)

- **Rotorsak:** Frontend skickade `action: 'free'`/`'unfree'` men `api/skip-day.js` validerade bara `skip`/`block`/`unblock` (Session 54:s omskrivning hade aldrig committats — bara `b1b62e9`-versionen fanns). "Gör fri dag" gav 400.
- **`api/skip-day.js` omskriven** till `free`/`unfree` med rätt semantik:
  - **free:** vald dag blir fri (blockerad, inget recept); allt fr.o.m. den dagen skjuts en dag framåt och matsedeln **förlängs en dag** (`end_date + 1`) så inget recept tappas. Krockskydd om nästa dag redan har en rad (egen planering) → 409.
  - **unfree:** invers — fria luckan tas bort, allt dras bakåt, sista dagen tas bort, `end_date` krymper.
- **Inköpslistan rörs inte:** receptmängden är invariant vid free/unfree, så ingen ombyggnad sker → bockningar bevaras. Frontend återanvänder `window._lastShop` så ingrediensförhandsvisningen inte blankas.
- **Modellnyckel:** meal_days = en rad per kalenderdag i `[start_date, end_date]` (konsekutiva). Skift sker på `content`-array frikopplat från datum, sedan mappas tillbaka.
- **Verifierat:** standalone-simulering av skift-logiken (free→unfree round-trip == original; första/sista-dag-edge). `node --check` på berörda filer. Inte kört mot live-DB (skulle mutera användarens aktiva plan).
- **Felmeddelanden:** `modifyDay` visar nu serverns vänliga svenska meddelande (t.ex. krock) istället för bara generiskt.
- **Cache-bust:** `js/app.js?v=83` (CSS oförändrad, v=90).

### Session 70 (2026-06-02) — Redigera-läge i inköpslistan (ta bort varor helt)

- **Önskemål:** Kunna ta bort ingredienser helt ur inköpslistan, inte bara bocka av dem. Tidigare hade bara manuella varor en ×-knapp; receptvaror gick bara att bocka.
- **Redigera-läge:** Ny knapp "✎ Redigera" (`#editModeBtn` → `toggleEditMode()`) ovanför listan i handla-vyn. Aktiv → `#shoppingList` får klassen `.editing` → en ×-knapp (`.remove-item-btn`) visas på *varje* vara (recept + manuell). Knappen blir "✓ Klar". I redigera-läget gör radklick inget (bara × tar bort) — `toggleShopItem` early-returnar på `window._editMode`.
- **`removeShopItem(key)`** (ny): slår upp rad-id via `window._shopItemIds[key]`, raderar `shopping_items`-raden, laddar om med `_preserveChecked=false`. Manuella varor använder fortsatt `removeManualItem`.
- **`buildShopState` robustgjord:** nycklar baseras nu på kompakt index (0..n) per kategori istället för DB-`position`. Annars hamnade bock-state fel efter en borttagning (luckor i `position` → render-index och nyckel-index divergerade). Sorterar rader på `position` före indexering.
- **`setShopMode`:** döljer redigera-raden i text-vyn och lämnar redigera-läget vid byte till "Kopiera lista".
- **Cache-bust:** `css/styles.css?v=90`, `js/app.js?v=82`. shopping-testet 62/62 oförändrat.
- **OBS (orört):** "Gör fri dag" (`/api/skip-day` free/unfree-mismatch) är fortfarande inte fixad — väntar på separat go.

### Session 69 (2026-06-02) — Lyft fram receptbyte i ej-bekräftad matsedel + bakgrundsbugg i meal_days-API:er

- **Hotfix (rotorsak till "Kunde inte byta recept"):** `api/replace-recipe.js`, `api/swap-days.js` och `api/skip-day.js` läste/uppdaterade `meal_days` via en `id`-kolumn som **inte finns** — tabellen har sammansatt nyckel `(household_id, date)`. PostgREST returnerade fel på den okända kolumnen → `data` null → endpointen svarade 404 "Dagen hittades inte i veckoplanen". Latent sedan Supabase-migrationen (Session 59), men osynlig eftersom knapparna låg gömda. Fix: `.select()` utan `id`, `.maybeSingle()`, och `.update().eq("household_id", …).eq("date", …)`. Verifierat mot live-DB via runtime-loggar + SQL.
- **OBS kvarstående separat bugg:** Frontend skickar `action: 'free'`/`'unfree'` till `/api/skip-day`, men endpointen validerar bara `skip`/`block`/`unblock` (Session 54:s free/unfree-omskrivning saknas i filen). "Gör fri dag" ger därför 400. Ej åtgärdad här — kräver återställning av free/unfree-semantiken (förlänger/krymper plan) och bör bekräftas separat.


- **Bakgrund:** Funktionerna att slumpa/välja recept fanns redan (`replaceRecipe`, `enterReplaceMode`), men låg gömda under "Ändra dag"-disclosuren från Session 68. Önskemål: lyft fram dem i preview-läget (ej bekräftad plan) innan inköpslistan byggs.
- **Detaljpanel:** "Slumpa nytt recept" + "Välj manuellt" lyfts ut ur disclosuren till en primär `.day-replace-actions`-rad (rust-primärknapp + outline) med hint-text. Disclosuren "Fler val" innehåller nu bara sekundära åtgärder (byt dag, gör fri dag, redigera egen planering). Gäller bara `canReplace = !readOnly && !planConfirmed && !isCustom`.
- **På kortet:** Den gamla `.swap-icon-btn` (bara byt dag) ersatt av `.day-card-actions`-kluster med två `.card-icon-btn`: 🔀 slumpa (`shuffleDay`) + ⇄ byt dag. Syns när kortet är markerat. Nya ikoner `ICON_SHUFFLE` + `ICON_PENCIL`.
- **`shuffleDay(date, btnEl)`** (ny): läser nuvarande recept-id live från kortet, anropar `/api/replace-recipe`, uppdaterar `window._lastPlan` och gör full re-render — undviker stale state.
- **`updateLastPlanDay()`** (ny hjälpare): håller `window._lastPlan` i synk även för panel-baserade byten (`replaceRecipe`, `selectRecipeForDay`) → en senare full re-render kan aldrig återställa en bytt dag (hård regel: befintlig veckoplan får aldrig förstöras).
- **`confirmPlan`:** tar nu bort `.day-card-actions` från korten efter bekräftelse (gamla `.swap-icon-btn.confirmed`-raden var en no-op — CSS-regeln saknades).
- **Tester:** match 51 / select-recipes 432 / shopping 62 / data-mapper 27 — oförändrade. (cookies + dispatch-testerna kräver `node_modules` och hoppas över lokalt.)
- **Cache-bust:** `css/styles.css?v=89`, `js/app.js?v=81`.

### Session 68 (2026-05-27) — Tidslinje-UX: matsedel-gruppering, kalender-datum, arkivkollaps

- **Matsedel-gruppruta (sticky etikett):** Ersatte absolut-positionerad `.plan-group-backdrop` med en vanlig flex-behållare `.plan-group` som omsluter matsedelns `.timeline-day`-element. Etiketten ("Matsedel 9 maj – 31 maj") har `position: sticky; left: 16px` och följer horisontell scroll utan JS-lyssnare. Bakgrundsfärg `--moss-soft`, etikettfärg `--lichen-deep`.
- **Kalender-stil datum:** Veckodag + datum lyftes ur korten till `.timeline-day-date`-etikett ovanför varje kort. `is-today` / `is-past` / `is-weekend` / `archive-day` på `.timeline-day`-wrappern → CSS styr färg.
- **Tillagningstid på kort:** `recipe.time` visas som `.week-day-time` (0.62rem, text-muted).
- **Arkivkollaps:** Arkivdagar döljs som standard (`archive-collapsed`). "Historik (N)"-chip i nav expanderar/kollapserar. `TIMELINE_DAYS_CAP` utökad till max 365d bakåt. OBS: chipsen syns bara när arkivdagar inte överlappas av aktiv plan.
- **"Ändra dag"-disclosure:** Knappar (byt recept, hoppa över, byt dag) samlas under `<details class="day-actions-details">`.
- **Cache-bust:** `css/styles.css?v=83`, `js/app.js?v=74`.

### Session 67 (2026-05-27) — Buggfix: dubbel Matsedeln-rubrik

- **Dubblerad rubrik borttagen:** `content-heading` lades till i Session 66 men den gamla `<h2 class="section-title">Matsedeln</h2>` inne i `#weekContent` togs aldrig bort → dubbla rubriker på mobil. Cache-bust v=70→71.

### Session 66 (2026-05-27) — Desktop-navigering + Amanda-fix

- **Supabase CLI installerad** (v2.101.0 via npm).
- **Amanda-fix:** `amanda.weimar@gmail.com` saknades i `household_members` → `getHouseholdId()` returnerade null. Lades till som `owner` via Supabase MCP. Inga kodändringar.
- **Ny registrering avstängd** (Authentication → Email → "Enable email signups" = off).

### Session 64 (2026-05-24) — Fas 3 klar + städning

- **`GEMINI_SCHEMA_PROMPT` utökat** med enhetskonvertering (cups→dl, tbsp→msk, oz→g, °F→°C m.fl.) + ingrediensöversättningar (heavy cream→vispgrädde, baking soda→bikarbonat m.fl.).
- **`postProcessForeignRecipe(recipe, apiKey)`** — anropas efter `extractJsonLd()` om domän ej `.se`. Kör Gemini för konvertering + översättning. Graceful degradation om Gemini misslyckas.
- **`callGemini()` splittad** i `callGeminiRaw()` + `callGemini()` för återanvändning.
- **`mapJsonLdToRecipe()`** strippar prisannoteringar (`$0.17*`) + tomma parenteser. Returnerar `seasons: []`.
- **Fas 3C live-verifierad:** budgetbytes.com, kochbar.de, jamieoliver.com → svenska ingredienser + metriska enheter.

### Session 63 (2026-05-24) — Realtime-subscriptions + 6E säsongsfix

- **`shopping_items`-prenumeration** i `shopping-list.js`: `subscribeShoppingItems(listId)` — riktad DOM-uppdatering vid UPDATE, full reload vid INSERT/DELETE. `unsubscribeShoppingItems()` vid clear.
- **`meal_days`-prenumeration** i `plan-viewer.js`: `subscribeMealDays(householdId)` — reload om inga aktiva interaktioner. Guard mot dubbelkoppling.
- **Feedback-loop-skydd:** `_checkedItems[key]` sätts optimistiskt → server-bekräftelse matchas mot lokal state → early return.
- **6E:** 3 säsongstaggar rättade i `recipes.json` + Supabase: ID 12, 98, 172.

### Session 62 (2026-05-24) — Auth-fix + arkitektur-sida

- **Arkitektur-sida** (`architecture.html`): SVG-diagram över GitHub/Vercel/Supabase/Willys/Gemini. Tillgänglig på `/architecture.html`.
- **Auth-omskrivning:** Magic link fungerade inte i iOS PWA (separata localStorage-utrymmen). OTP testades men Supabase rate-limitade. Slutlig lösning: **lösenordsbaserad inlogg** via `signInWithPassword`.
- **Lösenord satt via SQL:** `UPDATE auth.users SET encrypted_password = crypt(...)` — alla fick `hejhej22`.

### Session 61 (2026-05-23) — Städa efter Supabase-cutover

- **Borttaget:** `dualReadCheck()`, `api/recipes.js`, `api/custom-days.js`.
- **`api/shopping.js` trimmad** 53→25 rader: behåller bara `get_preferences`/`set_preferences`.
- **`toggleTested` migrerad** till Supabase i `recipe-browser.js`.
- **"Flytta till inköpslista"-knappen** fixad — `recipe_items_moved_at` mot Supabase direkt.
- **Vercel-funktioner:** 12→10.

### Session 60 (2026-05-23) — Fas 7E: cutover till main

- **Fas 7 KLAR** — `claude/crazy-mcclintock-d47bcb` mergad till `main` (commit `45a6433`).
- **Buggfix:** `api/confirm.js` satte `recipe_items_moved_at: null` → inköpslistan visades aldrig. Fix: sätts till `today`.
- **Buggfix auth:** `joakimweimar@gmail.com` lades till i `household_members`. Båda adresserna är nu owners.
- **671 assertions** (51 match + 62 shopping + 432 select-recipes + 70 dispatch + 29 cookies + 27 data-mapper).

### Session 59 (2026-05-23) — Fas 7D: all backend mot Supabase

- **`api/_shared/supabase.js`** (ny): service-role-klient med lazy Proxy-initialisering. `getHouseholdId()` hämtar första household.
- **`api/_shared/handler.js`**: `createSupabaseHandler` — CORS utan GITHUB_PAT.
- **`api/generate.js`**: recept från `recipes`-tabell, historik från `recipe_history`, arkiv till `plan_archives`, plan som `weekly_plans` + `meal_days`, shopping i `shopping_lists`/`shopping_items`.
- **`api/confirm.js`**: `confirmed_at` på `weekly_plans`, ny shopping-lista med items, bevarar manuella varor.
- **`api/skip-day.js`**: hämtar `meal_days`, shift i minne, batch-uppdaterar. **`api/swap-days.js`**, **`api/replace-recipe.js`**, **`api/discard-plan.js`**, **`api/dispatch-to-willys.js`**: alla mot Supabase.
- **671 assertions** oförändrade.

### Session 58 (2026-05-23) — Fas 7C steg 3: frontend mot Supabase

- **`js/app.js`**: recept från `recipes`-tabellen. **`js/recipes/recipe-editor.js`**: CRUD via Supabase, GitHub-polling borttagen.
- **`js/shopping/shopping-list.js`**: `buildShopState(list, items)` från Supabase-rader. `scheduleCheckedSave` batch-uppdaterar (max 2 requests). `addManualItem`→INSERT, `removeManualItem`→DELETE.
- **`js/weekly-plan/plan-viewer.js`**: fyra nya Supabase-hjälpfunktioner (`loadArchive`, `loadCustomDays`, `loadActivePlanFromSupabase`, `loadShopSummaryFromSupabase`). Custom-days skriver till `meal_days`.
- **545 assertions** oförändrade.

### Session 57 (2026-05-20) — Hotfix: appen laddade inte

- **Rotorsak:** Session 55:s manuella-varor-fix stängde `<li>`-template-literalen för tidigt → syntaxfel → hela ES-modulgrafen laddade aldrig.
- **Fix:** Sammanhängande template-literal. `onclick`-nyckel → citatsäkert `data-key`-attribut.
- **Lärdom:** `node --check` på alla `js/`-filer bör ingå i Definition of Done. Cache-bust v=67→68. PR #34 mergad.

### Session 56 (2026-05-20) — Nattjobb: schemalagd P1-fixning

- 12 P1-buggar fixade av remotejobb (CCR) kl 03:27 via `claude.ai/code/routines`. Commit `9ebe94e`. 644 assertions oförändrade.

### Session 55 (2026-05-20) — P1-buggfixar från kodgranskning

- `api/recipes.js` + `api/import-recipe.js`: `seasons`-fält tillagt i nya/importerade recept
- `api/dispatch-to-willys.js`: `res.ok`-kontroll på shopping-list-fetch
- `api/_shared/secrets-store.js`: cache nollställs innan skrivning (eliminerar stale-read-race)
- `js/shopping/shopping-list.js`: `removeManualItem` → `data-item`-attribut; bock-nycklar baseras på text (`manual::${item}`)
- `js/shopping/dispatch-preferences.js`: `prefsLoaded` sätts bara vid lyckad fetch; `savePrefs` debounced 500ms
- `js/shopping/dispatch-ui.js`: `AbortController` 20s timeout
- `js/weekly-plan/plan-viewer.js`: fade-lyssnare trackar DOM-referens efter re-render
- `js/weekly-plan/plan-generator.js`: `tureDays + vegDays` valideras + cappas mot `total_days`
- `css/styles.css`: `@keyframes spin` → `spinFast` för `.import-spinner`
- **644 assertions** oförändrade.

### Session 54 (2026-05-17) — Fri dag-sammanslagning + fri swap

- **`skip-day.js` omskriven** till två actions: `free` (skjuter framåt + förlänger) och `unfree` (drar bakåt + krymper). "Hoppa över"+"Blockera" → en knapp "Gör fri dag".
- **Fri swap:** `swap-days.js` omskriven. Byte mot fria plan-dagar + gap-dagar utanför planen (förlänger med fria dagar). Arkiv och custom-days avvisas.
- **Swap-UX:** Capture-phase click-lyssnare fångar swap-target-klick. `enterSwapMode` highlightar bredare urval.
- **644 assertions** oförändrade. Cache-bust v=64.

### Session 53 (2026-05-12) — Kodgranskning + P0-buggfixar

- **Kodgranskning:** 8 parallella agenter, 210 fynd (19 P0, 41 P1, 24 XSS m.fl.). Rapporter: `docs/review/00-summary.md` + `01`–`08`.
- **P0-fixar:** (1) `seasons: r.seasons || []` i fetchRecipes, (2) recipe-history uppdateras vid receptbyte, (3) saving/savingMatches kopieras vid skip, (4) `vitlöksklyftor` i Grönsaker, (5) swap blockeras på bekräftad plan + null-guards, (6) XSS-härdning: `escapeHtml()` i `utils.js`, applicerad i `renderIngredient`, `renderDetailInner`, `recipe-browser.js`, `shopping-list.js`.
- **545 assertions** oförändrade.

### Session 52 (2026-05-11) — Fri dag-interaktion + swap bakåt + Säsongsoptimering

- **Fri dag klickbar:** Panel med "Ångra fri dag" (`unblock`-action) + "Skriv notering" (→ custom-day).
- **Swap bakåt i tiden:** Tillåts på förflutna dagar i aktiv plan. `data-past` skiljer förflutna från readonly-arkiv.
- **Säsongsoptimering (Fas 6 klar):** 242 recept taggade `seasons`. `applySeasonWeight()`: 2x/1x/0.5x. Toggle i inställningar + filter i receptboken.
- **545 assertions**. Cache-bust v=62.

### Session 51 (2026-05-10) — Fas 1F live-verifierad + Inköpspreferenser + AI-prompt

- **Fas 1F:** `dry_run`-parameter verifierade prisoptimeringen end-to-end.
- **Inköpspreferenser:** Varumärkesblocklist + eko/svenskt-toggles. Sparas via `api/shopping.js` (`get_preferences`/`set_preferences`). Spec: `docs/superpowers/specs/2026-05-10-dispatch-preferences-design.md`.
- **AI-inköpsprompt:** Copy-paste-text för Claude i Chrome med varumärkesregler + oavbockade varor + 2s delay.
- **545 assertions**. Cache-bust v=60.

### Session 50 (2026-05-07) — Desktop-tidslinje + taggfilter + Ture-dagar

- **Desktop:** Tidslinje full bredd (max 1400px) vid ≥900px. Fade-gradienter via `.fade-left`/`.fade-right`.
- **Taggfiltrering:** Dynamiska checkboxar, `EXCLUDED_TAGS` exkluderar system-/protein-/kök-taggar.
- **Ture-dagar:** `ture_days`-parameter. `preferNonTure`-logik sparar ture-recept åt ture-dagar (loops 1–3). Buggar fixade: processingOrder sorterar ture-dagar först; `hasTure()` lowercase; 3 ture-recept fick `vardag30`; tidig validering om poolen är tom.
- **432 assertions** (538 totalt: 44 match + 62 shopping + 432 select-recipes).

### Session 49 (2026-05-06) — Buggfix inköpslista: kategorisering + truncering

- **Kategori-bugg:** `low.includes(kw)` → ordmängd-matchning `lowWords.has(kw)`. Fixar pankoströbröd→Mejeri, mangold→Frukt m.fl.
- **Trunceringsbugg:** `grönsaks- eller kycklingbuljong` → basnomen från afterEller-delen.
- **Filtrering:** "efter smak" strippas i `cleanIngredient()`.
- **62 assertions** oförändrade.

### Session 48 (2026-05-06) — Buggfix inköpslista (doh-mängder) + oprövade-fix
- **Inköpslista:** 5 rotorsaker: slash-bråk, ord-gräns på qtyPart, decimal-komma, float-avrundning, `nävar`/`huvuden` i SWEDISH_UNITS. 62 assertions.
- **Oprövade recept-gräns:** `underUntestedLimit()`-kontroll i alla pick()-loopar. Loop 5 som sista utväg. Test 13 tillagd.

### Äldre sessioner
Sessioner 8–47 arkiverade i `docs/session-log-archive.md`. Full git-historik: `git log --oneline`.
Höjdpunkter 31–47: Tidslinje-polish + custom-days (31–33); kassera-förslag + CDN-bugg (34); matchningsaudit 125→149 matches, CANON_REJECT_PATTERNS (35); testtäckning shopping + selectRecipes, PostToolUse-hooks (36); Willys cart-API PoC (37); Willys-dispatch full implementation + sökfallback (38–39); brainstorming cookie-refresh (40); mobil bottom-tab-nav (41); cookie-refresh-automation Chrome-extension MV3 + secret gist (42); design-system Scandi/nature (43); knapp-harmonisering fem tiers (44); 197 doh-recept scrapade (45); receptbrowser full refaktor + promotion (46); safe-area sticky-header-fix (47).

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
