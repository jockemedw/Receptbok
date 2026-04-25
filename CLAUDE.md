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
- **Lokal testmiljö:** Antigravity har inbyggd live preview för `index.html` — öppna filen där för att testa UI utan att pusha. Genereringsknappen kräver Vercel-backend och kan ej testas lokalt.

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
- [x] 1D — Matchningslogik **klar** (audit genomförd Session 35, rapport: `docs/match-audit-2026-04-19.md`). 53/62 recept matchar (upp från 51), 149 matches totalt (upp från 125), **spraygrädde-buggklassen eliminerad** via `CANON_REJECT_PATTERNS`. Priority 2-stemming implementerad via adjektiv-strip + token-scan + n-gram-fallback i `normalizeName`. Nya self-canons (aubergine/gurka/zucchini/paprika/chili/sallad) + utökad NON_FOOD_RE. 41 regressiontester i `tests/match.test.js` bevakade av PostToolUse-hook.
- [x] 1E — UX-design — **beslutad** (se nedan)
- [~] 1F — Implementation pågår: Steg 1 (CANON Priority 1), Steg 2 (`willys-offers`-endpoint + `willys-matcher`), Steg 3 (integration: `optimize_prices`-toggle, backend bucketar poolen efter besparing, UI visar "💰 Sparat ca X kr" per dag) klara. Kvarstår: live-test i Vercel + ev. Priority 2-stemming.

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
- [ ] 4F — Automatisera cookie-refresh (senare). Väg A: Chrome-extension som skickar cookies+CSRF till Vercel via webhook vid varje willys.se-besök. Bygg bara om manuell uppdatering var 3:e mån blir friktion.

**Fas 5 — App Store & monetisering** (marknadsanalys klar → `docs/marknadsanalys-2026-04.md`)
- [x] Marknadsanalys
- [x] 5A — Teknisk väg (PWA / Capacitor / React Native) — **klart** (`docs/research-teknisk-vag-app.md`, Session 28). **Rekommendation: Capacitor** (3–5 veckor). PWA blockas av Apple Guideline 4.2 ("repackaged website") och Safari-eviktion 7d förstör offline på iOS. RN kräver full omskrivning av alla ~11 frontend-moduler (8–16 veckor) — överdrivet för MVP. Capacitor: vanilla ES modules fungerar direkt, enkel build-step + Service Worker + Capacitor Preferences. Slutlig payment-väg (Stripe vs IAP) beror på Fas 5C.
- [ ] 5B — Autentisering & datamodell
- [ ] 5C — Kostnads- och intäktskalkyl

### Kända buggar
Inga just nu.

### Öppna utredningar
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
_(Tom — lägg till idéer här under sessioner)_

### Claudes idéer
- Offline-stöd via service worker — appen fungerar utan nät (recepten cachas lokalt, synkar vid anslutning)
- "Veckans vinnare"-vy — familjen röstar på bästa receptet varje vecka, bygger favoritdata
- Säsongsfilter — automatiskt vikta recept efter säsong (soppa/gryta höst-vinter, sallad sommar)

### Senaste session — Session 39 (2026-04-25) — Willys-dispatch live + tre buggfixar
- **Motivering:** Session 38 lämnade 4D+4E "klar i kod, live-test kvar". Sessionen: sätta Vercel env vars (`WILLYS_COOKIE`, `WILLYS_CSRF`, `WILLYS_STORE_ID=2160`), klicka knappen, verifiera mot willys.se/cart. Tre oavsiktliga gap upptäcktes under sanity-check och åtgärdades direkt.
- **Bugg 1 — Manuella tillägg gick ej att lägga till på tom lista:** `loadShoppingTab` returnerade tidigt om `!hasRecipe && !hasManual` och gömde hela `shopContent` (där manual-add-inputen låg). Fix: speglade manual-add-widgeten i `shopNoData` med egna IDs (`*Empty`) och parametriserade `addManualItem(inputId, btnId)` med defaults. Filer: `index.html`, `js/shopping/shopping-list.js`, `css/styles.css` (ny `.manual-add-empty`).
- **Bugg 2 — Dispatch ignorerade manuella tillägg:** Både `extractCanonsFromShoppingList` (backend) och `openDispatchConfirm` (frontend) tittade bara på `recipeItems`. Manuell `Kefir` triggade "Inköpslistan är tom — inget att skicka". Fix: båda läser nu också `manualItems` och kanoniserar dem på samma sätt som recept-ingredienser. Nytt regressionstest C2 i `tests/dispatch-to-willys.test.js` (53 → 56 assertions).
- **Bugg 3 — kefir saknades som self-canon:** `extractOfferCanon("Kefir Naturell Cultura Laktosfri 2,5%")` returnerade null → sök-fallback rejectade alla träffar → "no_matches". Samma klass som löstes för aubergine/gurka i Session 35. Fix: `kefir` (+ "kefir naturell", "naturell kefir") som self-canon i NORMALIZATION_TABLE + tillagd i Mejeri-kategorin. 3 nya assertions i `tests/match.test.js` (41 → 44).
- **Live-verifierat:** Användaren la till `Kefir` manuellt → klickade dispatch → `Arla Cultura Kefir Naturell` (20.34 kr) hamnade i willys.se/cart. **Första lyckade live-dispatchen från Receptbok → Willys-korg.**
- **Status:** Fas 4D + 4E nu fullt live-verifierade. Total regressionstäckning: **44 (match) + 62 (shopping) + 136 (select-recipes) + 56 (dispatch) = 298 assertions** bevakade av hooks.
- **Cookie-utgång:** `axfoodRememberMe` löper ut ca 2026-07-15 (~3 mån). Manuell refresh-rutin dokumenterad i `docs/superpowers/specs/2026-04-20-willys-dispatch-design.md`.

### Session 38 (2026-04-23) — Willys-dispatch implementation (Fas 4D+4E kod klar)
- **Motivering:** Task 37:s design-spec klar. Sessionen: validera 4E-sökning, skriva fullständig implementation-plan, och exekvera 9 av 11 tasks via subagent-driven-development. Task 10 (deploy + live-test) och Task 11 (valfri _KG-fix) återstår för nästa session — kräver Vercel env vars och manuell sanity-check.
- **4E-rekon (början av sessionen):** `GET https://www.willys.se/search?q=<canon>&size=<n>` returnerar publik JSON med `results[]`. Inga cookies, ingen auth. `code`-fältet (t.ex. `101233933_ST`) matchar `addProducts`-formatet rakt av. 18/20 canon-termer ger rimlig första-träff; två edge-cases (vitlök→"Lök Vit", grädde→vispgrädde) löses gratis genom att återanvända `extractOfferCanon` + `CANON_REJECT_PATTERNS` som filter.
- **Plan:** `docs/superpowers/plans/2026-04-23-willys-dispatch.md` (11 tasks, TDD). Task 1–9 kodade och committade via subagent-driven-development (fresh implementer per task + spec-review + code-quality-review). 2 spec-bugg upptäcktes under implementation och korrigerades i både kod och plan: (1) `extractOfferCanon("Torskfilé")` returnerar null (ingen mappning) — test bytt till Laxfilé; (2) `extractOfferCanon("Matlagningsgrädde")` returnerar self-canon "matlagningsgrädde" ≠ "grädde" — test bytt till "Vispgrädde Matlagning 35%" som extraheras till "grädde" och passerar rejectsMatch-negativlookahead.
- **Arkitektur:** Endpoint `api/dispatch-to-willys.js` har default-export (handler för Vercel) + named export `runDispatch({shoppingList, offers, searchClient, cartClient})` för testbarhet. Handler hämtar `shopping-list.json` från GitHub raw + offers från `fetchOffersFromWillys` (nu exporterad från `api/willys-offers.js`) + skapar `searchClient` och `cartClient`. `matchCanons` i `dispatch-matcher.js` kör rea först, sök som fallback. `cart-client` har preflight/addProducts/verifyCart.
- **Testtäckning:** `tests/dispatch-to-willys.test.js` — 53 assertions: Task 1 (exports), Task 2 (fetchOffersFromWillys), Task 3 (search med 5 edge-cases), Task 4 (matcher med rea-först/sök/rejects/dedupe), Task 5 (cart-client preflight/addProducts/verify), Task 6 (runDispatch happy path + 401 + no_matches + post_failed + addProducts-401). PostToolUse-hook utökad: edits av dispatch-endpointen eller någon shared-modul kör testen automatiskt, blockerar commit vid regression. **Totalt regressionstester: 41 (match) + 62 (shopping) + 136 (select-recipes) + 53 (dispatch) = 292 assertions** bevakade av hooks.
- **UI:** Ny `js/shopping/dispatch-ui.js` (~115 rader). Knapp `📤 Skicka till Willys` i shopContent, feature-flaggad via GET `/api/dispatch-to-willys` (döljs om `WILLYS_COOKIE`/`WILLYS_CSRF` saknas i Vercel env vars). Confirm-modal räknar ingredienser. Resultat-modal visar antal tillagda + rea/sök-fördelning + omatchade + länk till willys.se/cart. Mobil: full-width actions.
- **Status:** 11 commits pushade till main. Knappen är gömd i produktion tills env vars sätts. Nästa session: (A) Joakim sätter `WILLYS_COOKIE`, `WILLYS_CSRF`, `WILLYS_STORE_ID=2160` i Vercel enligt refresh-rutinen i `docs/superpowers/specs/2026-04-20-willys-dispatch-design.md`, (B) Claude pushar ev. sista CLAUDE.md-uppdatering, (C) manuell sanity-check: klicka knappen, verifiera i willys.se/cart, rapportera ev. _KG-produkt-rejects för att avgöra om Task 11 (pickUnit-växling) behövs.
- **Filer nya:** `docs/superpowers/plans/2026-04-23-willys-dispatch.md`, `api/dispatch-to-willys.js`, `api/_shared/willys-search.js`, `api/_shared/willys-cart-client.js`, `api/_shared/dispatch-matcher.js`, `js/shopping/dispatch-ui.js`, `tests/dispatch-to-willys.test.js`.
- **Filer ändrade:** `api/_shared/willys-matcher.js` (exports), `api/willys-offers.js` (extrahera fetchOffersFromWillys), `js/shopping/shopping-list.js`, `js/app.js`, `index.html`, `css/styles.css`, `.claude/settings.json`, `CLAUDE.md`.

### Session 37 (2026-04-20) — Willys cart-API PoC + design-spec
- **Motivering:** Användaren vill kunna trycka på en knapp i Receptboken och få veckans inköpslista automatiskt inlagd i Willys-korgen (Fas 4). Ursprunglig plan: Claude-in-Chrome-automation. Beslut att i stället utforska reverse-engineered HTTP-API för att köra från Vercel backend.
- **PoC (`scripts/willys-cart-poc.mjs`):** Verifierade empiriskt att `POST https://www.willys.se/axfood/rest/cart/addProducts` accepterar bulk-array med produktkoder. Auth = sessioncookies (`JSESSIONID` + `axfoodRememberMe` + `AWSALB`/`CORS`) + `x-csrf-token`-header. CSRF-token är långlivad (timmar+, troligen = `axfoodRememberMe` ≈ 3 mån). Token kan **inte** hämtas programmatiskt utan browser — sätts via XHR efter SPA-boot. Slutsats: manuell cookie+CSRF-export till Vercel env vars räcker för MVP.
- **Design-spec:** `docs/superpowers/specs/2026-04-20-willys-dispatch-design.md`. Kort arkitektur: ny endpoint `/api/dispatch-to-willys` som återanvänder canon-matcher från Session 35 → bulk-POST till Willys → verifiering via GET cart. Env vars: `WILLYS_COOKIE`, `WILLYS_CSRF`, `WILLYS_STORE_ID`. Qty alltid 1. Ingen auto-checkout — användaren betalar själv.
- **Material fynd i self-review:** Befintlig matcher returnerar **bara reavaror** (se `api/willys-offers.js:108` — offer-pool filtreras till produkter med `potentialPromotions`). MVP-täckning = 5–10 av 20–30 inköpslist-varor. Full täckning kräver Fas 4E (produkt-sökning för icke-reavaror) som separat PoC + spec.
- **Status:** Design godkänd, spec skriven, roadmap uppdaterad (4A–4C klara, 4D = implementation, 4E = produkt-sök, 4F = auto cookie-refresh). writing-plans-skill **inte** invocerad än — användaren stoppade för dagen ("vi nöjer oss för idag"). Nästa session: starta implementation-plan för 4D, eller utforska 4E först om hellre det.
- **Filer:** `scripts/willys-cart-poc.mjs` (ny), `scripts/.willys-cookies.local` (ny, gitignorerad), `.gitignore` (utökad), `docs/superpowers/specs/2026-04-20-willys-dispatch-design.md` (ny), `CLAUDE.md` (roadmap + session-post).

### Session 36 (2026-04-20) — Testtäckning shopping-builder + selectRecipes
- **Motivering:** Session 35 bevakar bara `shopping-builder.js`/`willys-matcher.js`. Clean→Parse→Normalize→Merge→Categorize-pipelinen och receptväljaren saknade regressionstester — lätt att råka regressa historiska buggfixar (kycklingfilé→Mejeri, cashewnötter-dedupe, citron-strip, proteinbalans, veg-slot) vid framtida ändringar.
- **Nya testfiler (Node-only, inga externa deps):**
  - `tests/shopping.test.js` — 62 assertions: parsing (mängder, bråk, intervall), normalisering (~15 aliaser), dedupe/merge, kategorisering (med fokus på historiska buggar: rostad-substring-false-positive, kryddor→Skafferi, PANTRY_ALWAYS_SKIP).
  - `tests/select-recipes.test.js` — 136 assertions i 8 grupper: grundfall, historikfiltrering, "längst sedan"-fallback, proteinbalans (20 iter), vardag/helg-matchning, veg-slot (30 iter), låsta recept, blockerade datum, bucketBySaving. Inline-kopia av `selectRecipes`/`bucketBySaving` från `api/generate.js` med varningskommentar om sync-plikt.
- **Flakefix (veg-slot):** Första fixturen läckte flaky ~6% över 50 körningar. Rotorsak: när `vegDaySet` placerade båda veg-dagar på helg + shuffle gav fisk+kött vardagar → söndag hade båda helg-proteinerna (fisk, kött) vid cap=2, tier 1 svalt, tier 2 returnerade veg. Fixat genom att lägga till 2 kyckling-helg60 i fixturen så tier 1 alltid hittar okappat non-veg-alternativ. Verifierat 200/200 rena körningar.
- **PostToolUse-hooks utökade** (`.claude/settings.json`): edits av `shopping-builder.js` kör `shopping.test.js`, edits av `generate.js` kör `select-recipes.test.js`. Misslyckade tester blockerar commit (exit 2). Matchern-hooken från Session 35 oförändrad.
- **Filer:** `tests/shopping.test.js` (ny), `tests/select-recipes.test.js` (ny), `.claude/settings.json` (utökad), `CLAUDE.md` (denna post).
- **Totalt regressionstester:** 41 (match) + 62 (shopping) + 136 (select-recipes) = **239 assertions** bevakade av hooks.

### Session 35 (2026-04-19) — Lexikon- och matchningsaudit
Kördes oavbrutet medan användaren sov, per eget direktiv. Fas A → F i ett pass.

- **Fas A — Datainsamling:** Snapshot `docs/snapshots/willys-2026-04-19.json` (143.6 KB) — 2 butiker (2160 Ekholmen + 2102), 148 matchbara erbjudanden per butik efter NON_FOOD-filter. 75 stemming-kandidater identifierade i 62 recept.
- **Fas B — Klassifiering:** Kryssprodukt 62 recept × 148 erbjudanden = 125 matches. Klassificerades via heuristik. Wrong-function: 8 fall (alla spraygrädde → matlagningsgrädde-recept). Wrong-product: 0. Non-food läckor: 0.
- **Fas C — Modellrevidering (lättviktigare än planerat):** Istället för full funktionell klassmodell infördes **CANON_REJECT_PATTERNS** (offer-textregex per canon) — samma effekt med mindre kod. Täcker grädde, mjölk, smör, fisk. `normalizeName` fick tre fallback-nivåer: adjektiv-prefix-strip (~60 adjektiv), token-scan baklänges med TOKEN_BLOCKLIST, och n-gram-sökning (2+3-gram). Nya self-canons (aubergine/gurka/zucchini/paprika/chili/sallad) + plural-mappings (tortillas/citroner/potatisar). Nya units (burkar/tummar/cm/förpackningar) + `à ca X g`-suffix-strip i `cleanIngredient`. Utökad NON_FOOD_RE (kosttillskott, proteinpulver, våtfoder, kattmos m.fl.).
- **Fas D — Regressiontester:** `tests/match.test.js` — 41 assertions utan externa deps. Täcker stemming-fallbacks, nya self-canons, nya units, CANON_REJECT_PATTERNS, spraygrädde-bugfix, positiva kontroller. **PostToolUse-hook** i `.claude/settings.json` kör testerna automatiskt vid edit av `shopping-builder.js`/`willys-matcher.js` och blockerar commit vid regression.
- **Fas E — Deploy:** En commit med alla ändringar + push till main.
- **Resultat (store 2160, verifierat mot snapshot):**
  - Matches: **125 → 149** (+24, +19%)
  - Recept med match: **51/62 → 53/62** (85.5%)
  - Wrong-function buggar: **8 → 0**
  - Alla 41 regressiontester passerar
- **Filer:** `api/_shared/shopping-builder.js`, `api/_shared/willys-matcher.js`, `api/willys-offers.js`, `tests/match.test.js` (ny), `.claude/settings.json`, `.gitignore`, `docs/snapshots/willys-2026-04-19.json` (ny), `docs/match-audit-2026-04-19.md` (ny).
- **Återstår:** Live-verifiering mot Vercel efter deploy (~30 sek efter push). `api/generate.js` oförändrad — använder `matchRecipe` genom samma signatur och får fixarna gratis.

### Session 34 (2026-04-18)
- **Kassera förslag — refresh-fix:** Cache-bust (`?t=Date.now()`) räckte inte — Vercel hinner inte re-deploya statiska `weekly-plan.json` på 30 sek. Bytt till att rendera `data.weeklyPlan` direkt från API-svaret (samma mönster som `generatePlan`). `weekContent` + `confirmPlanWrap` döljs när vyn blir helt tom. Commit `d26ef15`.
- **Besparingsdetaljer — klickbar 💰-badge:** `savingsById`-shapen utökad från `number` → `{ total, matches: [{canon, name, brandLine, regularPrice, promoPrice, savingPerUnit, validUntil}] }`. Per dag returneras `saving` + `savingMatches`. Frontend: `💰`-badge blir `<button class="week-day-saving has-details">` när matches finns → popover med kanonisk term + produkt + priser + `−X kr` per match + validUntil + footnote om att reapriser kan ändras.
- **Rea-varning för planer långt fram:** Om `optimize_prices` är på **och** `end_date` > 7 dagar från idag → `confirm()`-dialog innan generering.
- **Spraygrädde-buggen upptäckt:** "Pepprig pastasås med aubergine" fick falsk match mot "Spraygrädde Vispgrädde 35%" — `NORMALIZATION_TABLE` hade `"vispgrädde": "grädde"`. Fixades i Session 35.
- **Filer ändrade:** `api/generate.js`, `js/weekly-plan/plan-viewer.js`, `js/weekly-plan/plan-generator.js`, `css/styles.css`.

### Session 33 (2026-04-18)
- **Tre-vägs-editor på tom dag:** klick på tom/custom dag i tidslinjen öppnar detaljpanelen med tre option-cards (iOS settings-stil):
  1. **🍳 Välj recept ur receptboken** — sätter `window.customPickMode`, byter till recept-fliken, visar `#customPickBanner`. Val delegeras via `selectRecipeForCustomDay` → `/api/custom-days` (`action:'set'`).
  2. **📝 Egen notering** — inline input + "Spara notering"-knapp.
  3. **📅 Skapa veckomatsedel från denna dag** — fyller datumväljare och scrollar till generator-sektionen.
- **Bakåt-dagar:** visar bara notering-sektionen.
- **Custom-dag med recept:** slim-kort visar `🍳 Titel`. Detaljpanel visar "Redigera egen planering"-knapp + mode-notis. `data-readonly="1"` döljer replace/swap/skip-knappar.
- **Backend:** `api/custom-days.js` accepterar `recipeId` + `recipeTitle`. Format: `{ entries: { "YYYY-MM-DD": { note?, recipeId?, recipeTitle? } } }`.
- **CSS-klasser:** `.custom-day-header/-title/-sub`, `.custom-options`, `.custom-option{-note,-icon,-label,-chev,-head}`, `.custom-note-input/-save`, `.custom-day-remove`.
- **Filer ändrade:** `api/custom-days.js`, `js/weekly-plan/plan-viewer.js`, `index.html`, `css/styles.css`.

### Session 32 (2026-04-18)
- **Scroll-/datum-översyn av tidslinjen** — sex ändringar i ett pass:
  - **Dynamisk horisont:** `TIMELINE_DAYS_BACK/FORWARD = 14` → `..._MIN`. Verklig horisont räknas från max(MIN, avstånd till aktiv plans slutdatum / äldsta arkiv / yttersta custom-dag), cap 45 dagar. Löser fall där plan börjar om 7 dagar och löper 14 — hela planen syns.
  - **Egen planering (custom-days):** Ny endpoint `api/custom-days.js` + `custom-days.json`. Editor i detaljpanelen, notering max 140 tecken. Banner: "N tomma dagar innan matsedeln — markera alla".
  - **Slim-kort:** Custom/gap-dagar samma höjd (130px) men smalare bredd (72px) via `.timeline-day.slim`.
  - **Auto-scroll till planstart vid ny generering:** `renderWeeklyPlanData(..., freshlyGenerated=true)` centrerar på `plan.startDate` när planen är opåbörjad. Efter bekräftelse: "centrera idag".
  - **`.plan-pending` + NY-badge:** Aktiv oconfirmad plan får terrakotta border + pulserande ring + "NY"-badge. Försvinner vid `planConfirmed`.
  - **Nav-chips [Idag] [Matsedel →]:** Chippen för matsedeln pulsar när planen är pending.
- **Kassera förslag:** Ny `api/discard-plan.js` — tömmer `weekly-plan.json` och plockar bort planens recipeIds ur `recipe-history.json`. Rör inte `shopping-list.json` eller `plan-archive.json`. Sekundär "Kassera förslag"-knapp under "✓ Bekräfta", bara synlig medan planen är pending.

### Session 31 (2026-04-18)
- **Polish-pass på ±14 tidslinjen** efter live-test:
  - **Enhetlig kortstorlek:** `.week-day-card` fick `height: 130px` + flex-column. `.week-day-recipe` fick `-webkit-line-clamp: 3`.
  - **Trimmad topmarginal:** padding-top 1.5rem → 0.5rem, section-title margin-bottom 0.6rem → 0.15rem.
  - **Centrera idag vid tab-switch:** Ny `centerTodayCard({ smooth })` räknar `scrollLeft` explicit (scrollIntoView missar när fliken är `display:none`). Anropas via `requestAnimationFrame` från `switchTab('vecka')`.
  - **Veckoavgränsning:** `isoWeekNumber(dateIso)` i `utils.js` (ISO 8601, måndag). Vid vecko-byte: `.week-start`-klass (streckad separator + `v. NN`-etikett).
  - **Framhävda helger:** Weekend-bakgrund `#f3e8d4`, `.week-day-name` `font-weight: 700`, `opacity: 1`. Fungerar över pastell.

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
- **Färgtema:** Krämvitt `#faf7f2`, brun header `#5c3d1e`, terrakotta `#c2522b`
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
