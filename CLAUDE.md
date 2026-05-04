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
- [x] 4F — **Cookie-refresh-automatisering — implementation klar (Session 42, 2026-04-26).** Plan: `docs/superpowers/plans/2026-04-26-cookie-refresh-automation.md`. Chrome-extension fångar passivt cookies + CSRF vid willys.se-besök → POSTar till `/api/cookies/willys` → secret gist på GitHub. `dispatch-to-willys.js` läser via `secrets-store` med 5-min cache, fallback till env vars under övergång. Setup-instruktioner: `extension/README.md`. **Live-verifiering kvar** (kräver gist-skapande + Vercel env vars + extension-install).

**Fas 5 — App Store & monetisering** (marknadsanalys klar → `docs/marknadsanalys-2026-04.md`)
- [x] Marknadsanalys
- [x] 5A — Teknisk väg (PWA / Capacitor / React Native) — **klart** (`docs/research-teknisk-vag-app.md`, Session 28). **Rekommendation: Capacitor** (3–5 veckor). PWA blockas av Apple Guideline 4.2 ("repackaged website") och Safari-eviktion 7d förstör offline på iOS. RN kräver full omskrivning av alla ~11 frontend-moduler (8–16 veckor) — överdrivet för MVP. Capacitor: vanilla ES modules fungerar direkt, enkel build-step + Service Worker + Capacitor Preferences. Slutlig payment-väg (Stripe vs IAP) beror på Fas 5C.
- [ ] 5B — Autentisering & datamodell
- [ ] 5C — Kostnads- och intäktskalkyl

### Kända buggar
Inga just nu.

### Öppna utredningar
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
- Säsongsfilter — automatiskt vikta recept efter säsong (soppa/gryta höst-vinter, sallad sommar)

### Senaste session — Session 46 (2026-05-04) — Promotion av 197 doh-recept + komplett receptbrowser-refaktor
- **Motivering:** Sessionen började med att Session 45:s 197 staging-recept skulle granskas och promoteras. Användaren bad om att tagga alla med `doh` så de gick att granska enkelt sen. Efter promotion (62 → 259 recept) blev befintliga receptbrowsern (platt vertikal lista i ID-ordning) oöverblickbar — användarens formulering: "ogenomtänkt — bara evig scroll utan inbördes ordning". Resten av sessionen var iterativ refaktor av receptbrowsern.
- **13 commits totalt:** ab6e7a2 (promotion) → 1280d19 (group-by) → f6a95d9 (init-fix + pill-tabs) → ed86295 (bottom-sheets) → 9331467 (FAB-stack) → 62e88e0 (krymp avstånd) → 664b829 (scroll-lock) → 863a568 (37 kök-tags) → 986dfbd (21 fler kök + huvudingrediens) → 8009ac2 (chilaquiles-fix) → dd2ed03 (DOH-sektion) → ded0fee (FAB-ordning).

#### 1. Promotion av 197 dishingouthealth-recept med doh-tag (ab6e7a2)
- Skript: muterade `recipes-import-pending.json` att lägga `'doh'` i alla recipe.tags, sedan `node scripts/dish-scrape/promote.mjs`. recipes.json: 62 → 259 recept, `nextId` 63 → 262.
- Resultat: alla 197 doh-recept finns med tag `["...", "doh"]` så de kan filtreras/granskas enkelt.

#### 2. UX-analys + designbeslut group-by
- Föreslog 7 quick wins (filter AND/OR, sortering, compact-toggle, sticky-sök, smart-genvägar, empty recovery, alltid-synlig results-info). Användaren stoppade och bad om en sak att göra först. Vi enades om group-by med 5 dimensioner: Provat-status · Protein · Tid · Typ · Kök. Inom sektion alfabetisk på titel.

#### 3. Group-by-implementation (1280d19) — chip-filter ut, sortera-dropdown in
- `js/recipes/recipe-browser.js` — full omskrivning. Ny `GROUP_DEFS` (5 dimensioner) + `renderRecipeBrowser()` ersätter chip-baserad `applyFilters()`. Sökning mot `window.RECIPES`-array, inte DOM-attribut (drog bort `data-ingredients`/`data-instructions` från renderCard — ~MB onödig DOM på 259 kort).
- `js/state.js` — `window.groupBy = 'tested'`. `window.activeFilters` lämnad oanvänd för bakåtkompat med `recipe-editor.js`.
- HTML — chip-filter-blocket ersatt av `<select id="groupBy">`. Sticky `.recipe-section-header` med Playfair-rubrik + count-pill.

#### 4. Init-krasch + pill-tabs + notch-säker sticky (f6a95d9)
- **Init-bugg:** `countDisplay`-elementet finns inte i HTML men `app.js` rad 25 satte `.textContent` på den → TypeError → init() föll i catch och visade varningsruta i stället för listan. Pre-existing bug exponerad när jag flyttade `renderRecipeBrowser()`-anropet bakom raden. Tog bort död `countDisplay`-referens.
- Användaren rapporterade live: rull-list-fält för stort + sticky-header tunn (göms bakom selfie-kameran). Bytte select-dropdown mot 5 pill-tabs. Sticky fick `padding-top: max(0.85rem, env(safe-area-inset-top))` + tjockare typografi.

#### 5. Bottom-sheets (ed86295) — Sortera + Filter
- Användaren ville mer minimalistiskt med två separata knappar (Sortera + Filter) som öppnar bottom-sheets.
- Två kontroller höger i headern → öppnar slide-up-paneler. Sortera = 5 radio-val (klick stänger automatiskt). Filter = checkbox-grupper Status / Protein / Tid med "Rensa alla" + "Klar". Rust-prick på Filter-knappen när något filter är aktivt. Backdrop-tap, ESC och "Klar" stänger.
- Inga emoji — line-SVG chevrons enligt bottom-nav-stilen.

#### 6. FAB-stack i höger nedre hörn (9331467)
- Användaren ville cirkulära FAB-knappar nere höger som matchar scrolltop-pilen, alltid synliga.
- Två lichen-FAB:s (2.8rem) + scrolltop i en flex-column på höger sida. Sortera + Filter via `body[data-active-tab="recept"]` så de syns bara på recept-fliken. Filter-pricken som notification-prick i FAB:ens övre högra hörn.

#### 7. Krymp avstånd headern → första sektion (62e88e0)
- Användaren rapporterade ~2 rubrikrader extra mellanrum mellan grön header och första sektionsrubriken.
- Tre samtidiga orsaker: (a) sticky-headerns `padding-top: max(..., env(safe-area-inset-top))` tog plats ALLTID (även när inte sticky-fastnad) — bytt till `top: env(...)`. (b) `main` padding-top 0.5rem → 0. (c) "259 recept totalt"-raden gömd helt när inget filter/sökning är aktivt.

#### 8. Scroll-lock + default Kök (664b829)
- Bottom-sheet läckte scroll till bakomliggande receptlista (klassiskt iOS — `overflow:hidden` på body räcker inte). Bytt till position-fixed-trick: spara scrollY, lås body, återställ vid stängning. Plus `touch-action:none` på backdrop, `overscroll-behavior:contain` på panel.
- Default-gruppering Status → Kök.

#### 9. Klassificera 58 recept med ursprungskök (863a568 + 986dfbd)
- Skript: `scripts/classify-cuisine.mjs`. Konservativ keyword-klassificerare med titel-signaturord (lasagne, tacos, miso, harissa) + distinkta ingredienser. Två iterationer:
  - **Iteration 1** (90% konfidens, ≥1 titel ELLER ≥3 ingredienser, marginal ≥10): 37 recept.
  - **Iteration 2** (~80% konfidens, ≥2 ingredienser räcker, marginal ≥5, plus utökade ingredient-signaturer + specialregel "röd/grön curry → thailändskt, inte indiskt"): +21 recept.
- **Distribution:** mexikanskt 13, japanskt 9, medelhavet 9, indiskt 7, italienskt 6, mellanöstern 6, thailändskt 6, koreanskt 3, asiatiskt 2, franskt 2, vietnamesiskt 1, kinesiskt 1. **Totalt 65/259 (25%)**, 194 lämnas otaggade.
- Utökat `CUISINE_TAGS` i `recipe-browser.js` med 8 nya kök så grupperingen plockar upp dem.
- **Specialfall i koden:** I `classify()` finns explicit handling för `/röd\s+curry|grön\s+curry/i` → ger thailändskt-poäng + tar bort indiskt-poäng. Lade till för att curry-pattern annars överrider (typer av thai-curry är språkligt indisk-stämplade).

#### 10. Huvudingrediens-filter ersätter Protein (986dfbd)
- Användaren ville byta protein-filtret mot huvudingrediens. Beräknat dynamiskt via `mainIngredientOf()`-funktion i recipe-browser.js (keyword-matchning, första match vinner). Lista: Lax · Räkor · Kyckling · Tofu · Tempeh · Kikärtor · Linser · Bönor · Quinoa · Svamp · Annat.
- `protein`-fältet i recipes.json **orört** (matsedeln-algoritmen i `api/generate.js` använder det fortfarande för proteinbalans). Bara UI-byte. `window.recipeFilters.protein` → `window.recipeFilters.mainIngredient`.

#### 11. Chilaquiles-fix (8009ac2)
- #151 "Blomkålschilaquiles med salsa roja" missades av mexikanskt-klassningen pga regex-bug — `\bchilaquile/i` har word-boundary före, men "blomkåls" + "chilaquiles" bildar ett sammansatt ord utan boundary. Manuellt taggad som mexikanskt. Klassificeraren fortfarande oförändrad — minimal scope.

#### 12. Dishing out health-sektion (dd2ed03)
- Doh-recept utan annat kök-tag samlas nu i egen sektion "Dishing out health" under Sortera på Kök, mellan vanliga kök och "Övrigt". Doh-recept som **också** har cuisine-tag (mexikanskt + doh) hamnar i sin cuisine-sektion via first-match-wins.

#### 13. FAB-ordning: pilen överst (ded0fee)
- Användaren ville ha pil-knappen överst i FAB-stacken istället för längst ned. HTML-ordning ändrad till [scrolltop, openSortBtn, openFilterBtn]. Eftersom containern är bottom-fixed, hoppar Sortera + Filter ALDRIG (de stannar nederst), pilen dyker bara upp ovanför vid scroll>400.

- **Ej gjort (kvar i UX-analys):** Compact/expand-toggle, sticky-sök vid scroll, smart-genvägar, recept-tumnaglar, smartare sortering inom sektion (alfabetisk fortsatt). Diskuterade BBQ/Tex-mex/Cajun som ytterligare kreativa kök-tags men användaren skippade dem.
- **Cache-bust:** `?v=46` → `?v=56` (10 bumpar genom sessionen).
- **Status:** Allt live på https://receptbok-six.vercel.app/. recipes.json: 259 recept · 65 med kök-tag · 197 med doh-tag.
- **Nästa session (47):** Mobil-verifiering av FAB-stack-ordningen + scroll-lock i sheets på iOS Safari. Eller annan prioritering — Fas 4F live-verifiering (övergång från env vars till gist-baserad cookie-rotation), Capacitor-kickoff (Fas 5A), eller fortsätta receptbrowserns finputsning (compact-mode, smartare sortering inom sektion, recept-tumnaglar).

### Session 45 (2026-05-04) — Dishingouthealth-scrape: 197 recept i staging (promoterades i Session 46)
- **Motivering:** Plan från Session 43-cloud (commit `dba699f` på `claude/scrape-dishingouthealth-recipes-gwRU5`) flyttades hit för lokal körning eftersom webb-sandbox 403:ade dishingouthealth.com. Mål: engångs-scrape som hämtar amerikanska blogg-recept, översätter till idiomatisk svenska + konverterar enheter (cup→dl, °F→°C, lb→g) via Sonnet, skriver till staging-fil för granskning innan promotion till `recipes.json`.
- **Filer skapade:** `scripts/dish-scrape/` (ny katalog): `scrape.mjs` (~600 rader, Fas 1–4 sitemap→filter→Sonnet-loop→staging), `promote.mjs` (staging→`recipes.json`-merge), `finalize.mjs` (offline-staging-builder från progress-cachen), `package.json` (deps: `@anthropic-ai/sdk`), `pilot-urls.txt`. Staging-artefakter i repo-root: `recipes-import-pending.json` (197 recept) + `recipes-import-quality-report.md` (10 stickprov + varningsflaggor + distribution).
- **Pilot-iterationer (5 hand-plockade URLer):** Första pilot exponerade tre systematiska problem: (1) `"vegetarisk"` hamnade som tag (är `protein`-fält, inte tag), (2) engelska kvarlevor som `"thinsliced"` i ingredienser, (3) recept-card-rubriker som `"Tillbehör:"` läckte in. Skärpt system-prompt med explicit FÖRBJUDET-lista för protein-i-tags, ~25 prep-method-översättningar (`thinly sliced→tunt skivad`, `finely chopped→fint hackad`, etc.), regel `5b` om att filtrera bort rubriker. Re-pilot verifierade alla tre fixar.
- **User-direktiv mid-flight:** "Hoppa över alla under 4,5 i betyg" → la in `aggregateRating.ratingValue`-extraktion i `mapJsonLdToRaw` + skip-före-Sonnet om rating < 4.5. Sparar tokens (rating-skip = 0 Sonnet-anrop). Recept utan rating släpps igenom (kan inte avgöra).
- **Körning:** 710 sitemap-URLer → 159 slug-skippade (cookies/cakes/dressings/etc.) → 551 kandidater → 360 bearbetade när Anthropic-krediter tog slut vid recept #339. Av de 360: **197 importerade**, 127 Sonnet-skippade (för långa, side dish utan protein, lågt betyg), 36 fel (alla `"Your credit balance is too low"`).
- **Token-förbrukning:** 798K input + 145K output. Tempo ~12 sek/recept (Sonnet-recept), ~1.3 sek per rating- eller for-long-skippad URL.
- **Säkerhetsnät:** `progress.json` (gitignorerad, lokal) lagrar resultat per recept var 10:e iteration inklusive den fullt översatta recipe-objekten. `--resume`-flaggan plockar upp cachen och fortsätter från obearbetade. Inga tokens slösas vid omstart.
- **Status:** Kod + staging + rapport committade till `main`. **Manuell kontroll krävs** innan promotion: läs `recipes-import-quality-report.md` (10 random stickprov + varningsflaggor) och spotta-läs ev. `recipes-import-pending.json`. Vid OK: `cd scripts/dish-scrape && node promote.mjs` (lägger till 197 recept i `recipes.json`, `meta.totalRecipes` 62→259, `nextId` 63→262, bumpar `lastUpdated`, raderar staging-filerna). Vid avstå: `rm recipes-import-pending.json recipes-import-quality-report.md`.
- **Återupptag av återstående 191:** Ladda Anthropic-credits ($5 räcker), kör `cd scripts/dish-scrape && node scrape.mjs --resume`. Cachen plockas upp, bara obearbetade URLer går till Sonnet. (Notera: nuvarande resume-logik *skippar* errors-cache-entries — för retry på de 36 fel-URLerna måste de manuellt rensas ur progress.json först, eller `--retry-errors`-flagga läggas till i scrape.mjs.)
- **Out of scope den här sessionen:** mobil-verifiering av forest-Generera-knappen från Session 44.
- **Nästa session (46):** Granska och promote (eller avstå) — kort session. Eller mobil-verifiering av forest-knappen. Eller Willys+ medlemserbjudanden (öppen utredning).

### Session 44 (2026-05-03) — Knapp-harmonisering (fem tiers)
- **Motivering:** Session 43 lämnade knapp-geometri som "out of scope" eftersom färg-pivoten redan var stor. Användaren bad direkt efter ("Kör allt, om jag inte gillar det justerar vi efteråt") att exekvera även detta i samma kvällssession. Designens button-card från bundlen specade en (1) geometri + fem tiers; mappade Receptbokens 25 knapp-klasser mot designens system.
- **Spec/plan/exekvering:** Skippad formell brainstorming/writing-plans-pipeline eftersom designen är fullt specificerad i `components-buttons.html` och användaren explicit delegerade. Brainstorm-output dokumenterad i förra sessionens chat.
- **Geometri (alla fem tiers):** 8px radie, 1.5px border (även filled-knappar har border = bg-color så höjden räknas konsekvent), font-weight 500 (förut blandat 500/600), `line-height: 1`. Vertikal padding ~0.65–0.75rem ger ~38–42px höjd. Horisontell varierar med knappens roll (kompakt 1rem, normal 1.2rem, CTA 1.5rem) — håller den funktionella visuella vikten där den behövs utan att bryta höjd-rytmen.
- **Tier-mappning:**
  - PRIMARY (rust filled): `.generate-btn`, `.confirm-plan-btn`, `.btn-save`, `.flytta-btn`, `.shop-dispatch-btn` (5 knappar — alla "commit"-handlingar)
  - SECONDARY (lichen filled): `.btn-import-action`, `.manual-add-btn` (2 knappar — positiva supporting-actions)
  - OUTLINE (transparent + birch border + forest text): `.replace-recipe-btn`, `.discard-plan-btn`, `.day-action-btn`, `.shop-copy-btn`, `.trigger-toggle-btn`, `.custom-bulk-btn` (6 knappar). Hover: border-color → forest, bg → moss-soft.
  - GHOST/DANGER (transparent + rust-deep): `.shop-clear-btn`, `.btn-delete` (2 knappar). Hover: rgba(181,106,76,0.08) bg.
- **Visuella skiften att vara medveten om:**
  - `.trigger-toggle-btn` var capsule (radius 20) — nu rektangulär (radius 8). "+ Ny plan"-toggle tappar pill-form.
  - `.replace-recipe-btn` hade rust-border (signalerade "öppen handling" i tidslinjen) — nu birch (neutralt). Möjlig regression: knappen kan kännas mindre inbjudande att klicka. Kan rullas tillbaka till rust om visuell test säger det.
  - `.shop-copy-btn` hade clay-tinted bg — nu helt transparent. Subtil minskning av visual weight.
  - `.btn-delete` hade rust-deep border — nu transparent (designens danger = ghost med rust-deep text + bg-tint på hover).
- **Lämnat utanför 5-tier-systemet** (kontextspecifika, inte CTA): `.filter-btn` (chip i mörk header), `.swap-icon-btn` (tiny icon), `.prot-btn` (pill-toggle), `.select-btn` (mini), `.shop-mode-btn` (toggle-tab), `.remove-manual-btn` (× knapp), `.edit-recipe-btn` (link-style), `.import-photo-btn` (stor card-tile). 8 utility-knappar oförändrade.
- **`.trigger-btn`** är dead code (definierad i CSS men ingen markup använder klassen). Lämnad orörd — kan rensas i en separat housekeeping-pass.
- **341 backend-asserts passerar oförändrat.** Inga JSON/data/JS-ändringar — ren CSS-refaktor.
- **1 commit på feature-branch `claude/button-harmonization`**, +99/−73 rader. Push och merge till main följer i samma session.
- **Status:** Live på Vercel ~30 sek efter push. Mobil-verifiering gjord i samma session (se nedan).

#### Live-iterationer samma session (efter mobil-verifiering)
- **Cache-bust-fix:** Användaren reload:ade på mobilen och såg fortfarande gammal CSS (terracotta-färg + gamla formspråket). Browser/CDN-cachen serverade `css/styles.css` utan version-suffix. Lösning: lade till `?v=44` på `<link rel="stylesheet" href="css/styles.css">` och `<script src="js/app.js">` i `index.html`. Bumpas vid varje session som ändrar CSS/markup. Commit `7418948`, merged `ed15b02`.
- **Generera-knappens form:** Användaren rapporterade efter cache-fix att Generera-knappen såg "off" ut (för platt och bred på full-width, sparkle-stjärnan för subtil). Justering: padding 0.75rem→1rem (~48px höjd), border-radius 8px→14px, font-size 0.95rem→1rem, sparkle-SVG `fill="currentColor"` (solid stjärna istället för outline), `box-shadow 0 2px 10px rgba(rust, 0.20)` för lift från linen-canvasen. Commit `c753765`, merged `8274f14`. Bumpade ?v=45.
- **Generera-knappens färg:** Användaren tyckte fortfarande terracotta/rust skar sig mot scandi/nature-schemat (lichen-header + linen-canvas). Bytte `.generate-btn` background+border+shadow från `var(--rust)` (#b56a4c) → `var(--forest)` (#3d5544). Mörkgrön CTA matchar paletten utan att smälta in (mörkare än lichen-headern, sticker ut som primär action). Commit `5abec6c`, merged `3915677`. Bumpade ?v=46.
- **Övriga rust-CTA lämnade orörda** (.confirm-plan-btn, .btn-save, .flytta-btn, .shop-dispatch-btn). De är "commit"-handlingar i sina kontexter och visas inte sida vid sida med Generera, så samma tonal-konflikt-argument gäller inte direkt. Flagga för uppföljning om de också känns off i nästa session.
- **Total session-räkning:** 18 commits över 4 feature-branches (`claude/design-system-scandi` 15, `claude/button-harmonization` 2, `claude/cache-bust` 1, `claude/generate-btn-polish` 1, `claude/generate-btn-forest` 1, plus 4 merge-commits). All CSS, ingen logikändring. 341 backend-asserts passerar.

- **Nästa session (45):** Mobil-verifiering av Generera-knappen i forest. Om det landar bra: utvärdera om de övriga rust-CTA också ska bytas till forest eller lichen-deep för full tonal-konsekvens. Eventuella iterationer på outline-knappar (.replace-recipe-btn kan rullas tillbaka till rust-border om den känns för "tyst" i tidslinjen). Eller helt annan prioritering — knapp-touch-target-höjd (44px Apple HIG) om något knappar känns för smått, eller fortsätta på dishingouthealth-scrape-arbetet i `scripts/dish-scrape/`.

### Session 43 (2026-05-03) — Design-system-migration (Scandi/nature-pivot)
- **Motivering:** Användaren iterativt designat ny visuell identitet i Claude Design (handoff-bundle: `receptboken-design-system`). Pivot från warm-brown/terracotta/cream/gold → lichen-grön/forest/rust/ochre/linen ("Scandi/nature"). Plus hand-tecknade lo-fi line-SVG-ikoner istället för färgglada emoji.
- **Spec:** `docs/superpowers/specs/2026-05-03-design-system-migration-design.md`
- **Plan:** `docs/superpowers/plans/2026-05-03-design-system-migration.md` (15 tasks, big-bang per användarval)
- **Token-pivot i `css/styles.css`:** `:root` skrivet om — 9 gamla tokens (--cream/--warm-brown/--terracotta/--sage/--gold/--ink/--light-sage/--light-terra/--warm-white) bytta mot 14 nya (--linen/--linen-card/--paper/--stone/--lichen/--lichen-deep/--moss-soft/--forest/--forest-deep/--rust/--rust-deep/--clay/--birch/--birch-soft/--moss-muted/--ochre). Semantic aliases (--border, --text-muted, --color-success, --color-success-dark, --color-danger) pekar nu till nya tokens. ~163 references uppdaterade via global rename. 8 strö-hex tokeniserade. Plan-pastels (timeline-arkiv) bytta från grön/blå/beige/lila → moss/slate/birch/clay (earth-tone). Pill-radie 20px → 4px (lo-fi/Scandi).
- **JS inline-style-fix (efter plan-task-13-grep):** 19 references till gamla token-namn i `js/{app,recipes/*,weekly-plan/*}.js` som dynamiskt sätter `.style.color`/`.style.cssText`/`.style.outline` med `var(--terracotta)` etc. — bytta till `var(--rust)`/`var(--lichen)`. De fallback:ade till browser default eftersom tokens inte finns längre. Plus `<meta name="theme-color">` i `index.html` (`#5c3d1e` → `#7a9482`) och `PROTEIN_COLOR.vegetarisk` i `js/utils.js` (`#4a7d4e` → `#5e7a68`).
- **Emoji → inline-SVG:** 13 emoji i `index.html` och 8 dynamiskt-renderade i `plan-viewer.js`/`shopping-list.js`/`dispatch-ui.js` bytta mot hand-tecknade line-SVG:er i `currentColor` enligt mönstret från Session 41 (bottom-nav). SVG-paths från `brand-iconography.html` i designbundlen. Ny `.icon`-utility-klass följer text-storlek (1em) med `vertical-align: -0.125em`. Storleks-modifiers `.icon-em-1-2/-1-5/-2` för section-titles, FAB respektive empty-states. Bottom-nav-SVG:erna oförändrade (redan Lucide-stil).
- **toggleSettings JS-fix:** Settings-chevron tidigare swap:ade textContent (`▾`/`▴`). Eftersom SVG nu sitter där bytt till `classList.toggle('open')` + CSS-rotation via `.settings-chevron.open svg { transform: rotate(180deg); }`.
- **Centrala konsekvenser:** Top-header brun → lichen-grön. Active tab/CTA terracotta → rust. Today-state: rust-ring runt hela kortet → lichen-ring + moss-soft fyllning + rust-prick (rust används bara som liten saturated punkt). Selected/open recipe-card-border terracotta → lichen ("selected = lugn", inte "alarm"). Tested-pill, savings-text och success-states sage → lichen-deep.
- **Inga JSON/data/backend-ändringar.** 341 backend-asserts passerar oförändrat (44 match + 62 shopping + 136 select-recipes + 70 dispatch + 29 cookies-endpoint).
- **Out of scope:** Knapp-geometri-harmonisering (spec nämnde 38px hög, 8px radie för primary/secondary, 5 tiers). Receptboken har 10+ knapp-klasser (`.generate-btn`, `.confirm-plan-btn`, `.flytta-btn`, `.shop-mode-btn`, `.btn-save`, etc.) — separat layout-pass om behovet känns kvar efter live.
- **15 commits** på feature-branch `claude/design-system-scandi`, mergead till `main`. Verifiering: läst tillbaka varje editerad fil + grep för 0 träffar på gamla token-namn, gamla brand-hex och emoji i appens kod (3 separata kontroller).
- **Status:** Live på https://receptbok-six.vercel.app/. Användaren har inte mobil-access just nu — verifiering deferred enligt explicit OK. Rollback om regression upptäcks: `git revert <merge-commit>` på main.
- **Nästa session (44):** Mobil-verifiering av nya paletten (när användaren är vid telefonen). Eventuell knapp-geometri-harmonisering om något knapp-pass känns inkonsistent.

### Session 42 (2026-04-26) — Fas 4F implementation: cookie-refresh-automation
- **Motivering:** Session 40 lämnade specen klar (`docs/superpowers/specs/2026-04-25-cookie-refresh-automation-design.md`). Session 41 prioriterade UI-jobb. Den här sessionen exekverade en 7-task implementation-plan via `superpowers:writing-plans` + `superpowers:subagent-driven-development` (fresh implementer per task + spec-review + code-quality-review). Mål: eliminera manuell quarterly-rotation av `WILLYS_COOKIE`/`WILLYS_CSRF`.
- **Plan:** `docs/superpowers/plans/2026-04-26-cookie-refresh-automation.md` (~830 rader, 7 tasks).
- **Backend:**
  - Ny `api/_shared/secrets-store.js` (88 rader) — `createSecretsStore({fetchImpl, pat, gistId, ttlMs})` exposes `readUser/writeUser/clearCache`. Gist-backed via GitHub Gists API. 5-min in-memory TTL cache. `writeUser` läser fresh state innan PATCH för att inte stomp:a parallella users. Header-kommentar dokumenterar att SHA-retry inte gäller (Gists API saknar concurrency control, last-write-wins).
  - Ny endpoint `POST /api/cookies/willys` (`api/cookies/willys.js`, 60 rader) — validerar `X-Refresh-Secret`-header, payload-fält (`{userId, cookie, csrf, storeId}` alla non-empty strings), patchar gist via store. Felkoder: `unauthorized` (401), `bad_request` (400 med `field`-pekare), `store_write_failed` (502). Named export `runRefresh({secretHeader, expectedSecret, payload, store})` för test.
  - `api/dispatch-to-willys.js` läser cookies via ny `resolveWillysSecrets({store, env, userId})`-helper — föredrar gist (när både cookie + csrf finns), faller tillbaka till env vars (`WILLYS_COOKIE`/`WILLYS_CSRF`/`WILLYS_STORE_ID`). `featureAvailable = !!secrets`. POST loggar `dispatch source=gist|env` så Vercel-loggar visar vilken källa som tog över.
- **Frontend (Chrome-extension):** Ny `extension/`-katalog (5 filer, ~420 rader totalt).
  - `manifest.json` — MV3, permissions `cookies/webRequest/storage/alarms`, host_permissions begränsade till `*.willys.se` + endpoint-host.
  - `popup.html/css/js` — settings-form (shared secret + butiks-ID), status-dot (grön/gul/röd baserat på age), manual-refresh-knapp. try/finally runt sendMessage så knappen inte hänger om background.js failar.
  - `background.js` (137 rader) — service worker. Fångar `x-csrf-token` via `webRequest.onSendHeaders` på `*.willys.se`, läser cookies via `chrome.cookies.getAll`, POSTar till endpointen när senaste refresh ≥ 7 dagar. Race-skydd via `refreshInFlight`-flag (30s TTL self-healing). Triggers: CSRF-capture, alarms (var 6h), browser-start, manuell knapp.
  - `README.md` — engångs-setup (gist + PAT-scope + env vars), install via `chrome://extensions`, statusindikator-legend, felsökning.
- **Tester:** Ny `tests/cookies-endpoint.test.js` — 29 assertions (8 secrets-store cache+gist-patch + 8 runRefresh secret/payload-validering, fler totalt eftersom `assertEq` räknar varje call). Utökad `tests/dispatch-to-willys.test.js` — 14 nya assertions (R1–R7) för `resolveWillysSecrets` (gist-första, env-fallback, gist-fel-recovery, store=null, partial-gist edge cases). **Totalt regressionstester: 44 (match) + 62 (shopping) + 136 (select-recipes) + 70 (dispatch) + 29 (cookies-endpoint) = 341 assertions** bevakade av hooks.
- **PostToolUse-hook:** `.claude/settings.json` utökad — edits av `*cookies/willys.js` eller `*secrets-store.js` triggar `cookies-endpoint.test.js`, exit 2 blockerar commit.
- **Migration utan downtime:** Befintliga `WILLYS_COOKIE`/`WILLYS_CSRF`/`WILLYS_STORE_ID` env vars ligger kvar som fallback. Tas bort efter ≥2 lyckade gist-baserade dispatchar i nästa session.
- **Engångs-setup kvar för användaren** (kan inte automatiseras): generera `WILLYS_REFRESH_SECRET` med `openssl rand -hex 32`, skapa secret gist `willys-secrets.json` med `{"users":{}}`, uppdatera `GITHUB_PAT` med `gist`-scope, sätt `WILLYS_REFRESH_SECRET` + `WILLYS_SECRETS_GIST_ID` i Vercel, ladda extensionen via `chrome://extensions` → Load unpacked → `extension/`. Detaljer: `extension/README.md`.
- **Workflow-anteckning:** Subagent-driven-development funkade smidigt — fresh implementer per task höll context tight, spec-reviewer fångade 0 spec-bugs, code-quality-reviewer fångade 5 mindre observationer (header-comment-drift i Task 3, knapp-hängning i Task 4, race-doc i Task 5) som applicerades inline som follow-up commits utan att blockera nästa task. 18 commits totalt.
- **Status:** Kod live + **fullt live-verifierad** efter user-guidad setup samma session. Gist-flödet tar över — popup grön, dispatch funkar.
- **Setup-walkthrough (samma session, post-implementation):** Steg-för-steg-guide för engångs-setup. Två overksamma snubblingar längs vägen: (1) användarens befintliga `GITHUB_PAT` var fine-grained → fine-grained tokens stödjer inte gists → ny `GITHUB_GIST_PAT`-env-var med fallback-logik (commit `49853e7`), (2) Vercel Hobby-planen tillåter max 12 serverless-funktioner och `api/cookies/willys.js` var den 13:e → slå ihop refresh-cookies-handlern in i `api/dispatch-to-willys.js` som sub-route via `?op=refresh-cookies` (commit `9f769ee`). Båda hittade live, åtgärdade inom 5 min vardera, alla tester gröna.
- **Bonus-fixar samma session (efter live-verifiering):** (a) "Öppna din korg på willys.se"-knappen 404:ade → bytt till `https://www.willys.se/` (homepage respekterar butiks-cookien) + förenklad knapptext "Öppna willys.se" (commit `855907a`). (b) Mobil-zoom låst via `maximum-scale=1.0, user-scalable=no` i viewport-metan för att stoppa orientering-glitches vid pinch-to-zoom (commit `2cf46bb`).
- **Nästa session (43):** Övervaka att 2+ dispatchar logger `source=gist` i Vercel-loggen, ta sedan bort env-fallbacken (`WILLYS_COOKIE`/`WILLYS_CSRF`/`WILLYS_STORE_ID`). Eller annan prioritering — kanske Fas 1F Priority 2-stemming live-test eller Fas 5A Capacitor-kickoff.

### Session 41 (2026-04-25) — Mobil bottom-tab-navigering implementerad
- **Motivering:** UX-förberedelse inför Fas 5A (Capacitor-paketering). Flik-navigeringen flyttades från toppen till botten på mobil — där tummen når naturligt och där native mobil-appar konsekvent placerar primär-nav. Toppheaderns textflikar duplicerade då bottom-bar och kunde gömmas.
- **Brainstorming-flöde:** 7 A/B/C-frågor i `superpowers:brainstorming` låste designen: (1) ikon + text under, (2) inline SVG line-ikoner (Lucide-stil), (3) mobil-toppheader minimerad — titel kvar, flikar bort, sökruta kvar inom header, (4) aktiv flik = krämvit pille bakom + terracotta ikon/text, (5) bar:n alltid synlig på mobil (ingen autohide), (6) FAB/scrolltop lyfts via CSS-variabel, (7) två separata `<nav>`-element + delad `data-tab`-baserad switchTab.
- **Spec:** `docs/superpowers/specs/2026-04-25-mobile-bottom-tab-nav-design.md` (398 rader). Plan: `docs/superpowers/plans/2026-04-25-mobile-bottom-tab-nav.md` (599 rader, 7 tasks med konkreta SVG-paths från Lucide Book/CalendarDays/ClipboardCheck).
- **Implementation (inline execution, 7 tasks pushade direkt till main):**
  1. `--bottom-nav-h` CSS-variabel + body-padding + lyft FAB/scrolltop (`e3ad33e`)
  2. `data-tab`-attribut + switchTab refaktor till `querySelectorAll('[data-tab]')` (`9d4dcad`, inkl. CLAUDE.md-fix av "Antigravity"-rad → "verifiering på mobil mot live Vercel")
  3. Bottom-nav markup med 3 SVG-ikoner (`a31bd22`)
  4. Bottom-nav CSS — synlig knapp-rad, terracotta pille bakom aktiv flik (`e0adbe5`)
  5. Höjd-justering (+30%, 52→68 min-height, 64→84 --bottom-nav-h) efter visuell verifiering (`d365dd8`)
  6. Mobil-toppheader minimering + `viewport-fit=cover` (`73af9e3` + rollback i `221f6c9` efter feltolkning av "Ja"-svar)
- **Live-justeringar baserat på visuell feedback:** (a) bar:n var för låg → +30% höjd, (b) misstolkat "Ja" som "göm hela toppheadern" istället för bara textflikarna → rullade tillbaka, sökrutan tillbaka in i `<header>` så bakgrundsfärgen sträcker sig full bredd. Lärdom: tydligare frågor när användaren ger korta svar.
- **Filer ändrade:** `index.html` (data-tab på topp-nav, ny `<nav class="bottom-nav">`, `viewport-fit=cover`), `css/styles.css` (--bottom-nav-h, .bottom-nav-block ~58 rader, mobil-minimering av .header-bar), `js/ui/navigation.js` (querySelectorAll-refaktor), `CLAUDE.md` (Antigravity → mobil-mot-Vercel).
- **Status:** Live på https://receptbok-six.vercel.app/. Capacitor-redo via `env(safe-area-inset-bottom)` + `viewport-fit=cover`. Inga API/JSON-ändringar. Ingen automatiserad testtäckning för UI (per repots befintliga praxis), all verifiering manuell på mobil.
- **Nästa session (42):** Tillbaka till Fas 4F (cookie-refresh-automatisering) — implementation-plan via `writing-plans` skill för specen från Session 40, eller annan prioritering om användaren önskar.

### Session 40 (2026-04-25) — Brainstorming Fas 4F (cookie-refresh-automatisering)
- **Motivering:** Manuell cookie-refresh-rutin från Session 39 kräver ~5 min DevTools-extraktion var 3:e månad. För en familjeapp är 4 manuella interventioner per år för mycket friktion. Sessionen: utforska de fyra vägarna i öppna utredningar och låsa en design.
- **Brainstorming-flöde via superpowers:brainstorming-skill:**
  1. **Ambitionsnivå:** Användaren valde "noll touch" (alternativ A). Det stryker direkt vägar som kräver manuellt klick eller manuell extraktion (bookmarklet, förenklad CLI).
  2. **Besöksmönster:** Var 2:a–3:e vecka på willys.se (när auto-genererad varukorg ska beställas). Bekvämt inom 3-månadersfönstret för passiv refresh → extension viabel.
  3. **Vägval mellan extension och headless-login:** Extension vinner — headless-login kräver BankID/SMS-OTP-bekräftelse vilket Willys+ troligen kräver, och Vercel-cron med headless browser är tungt + risk för anti-bot-detektion. Min rekommendation = A (Chrome-extension).
  4. **Multi-user & App Store-fråga:** Användaren frågade om vägen skalar. Ärligt svar: extension dör på mobil (Chrome Android = inga extensions, Safari iOS = bara via native app-värd). Skalbar lösning för Capacitor-app i Fas 5A = in-app WebView-capture. Backend designas klient-agnostiskt från dag ett (`{userId, cookie, csrf, storeId}`-payload) så samma endpoint funkar för båda klienter.
  5. **Rekommendationer i designen:** (a) lagring = secret gist på GitHub (återanvänder GITHUB_PAT-mönster, undviker Vercel Blob-SDK), (b) ingen preflight-validering (YAGNI), (c) refresh-trösklar 7d/60d/80d (skip/aggressivt/varning), (d) shared secret i popup-inställningar (lätt att rotera), (e) migration utan downtime via env-var-fallback under övergång.
- **Spec klar:** `docs/superpowers/specs/2026-04-25-cookie-refresh-automation-design.md` (274 rader). Self-review hittade två fixes som applicerades inline: (1) "privat gist" → "secret gist" (GitHub-term, plus säkerhetsmodell-anteckning), (2) `storeId`-fält tillagt i popup-inställningar för konsekvens med edge-case-beskrivningen.
- **Status:** Spec committad (commit `b556464`). Implementation-plan (writing-plans-skill) **inte** invocerad — användaren stoppade för dagen och flaggade UI-jobb för nästa session.
- **Nästa session (41):** Mobil bottom-tab-navigering. Användaren vill flytta flik-orienteringen från toppen till botten där tummen når på mobil. Mer "knapp"-känsla än dagens rubrik-stil. Berör `index.html`, `css/styles.css`, ev. `js/ui/navigation.js`. Standard-mönster i native appar — viktigt UX-steg innan Fas 5 (Capacitor-paketering).
- **Filer:** `docs/superpowers/specs/2026-04-25-cookie-refresh-automation-design.md` (ny), `CLAUDE.md` (denna post + roadmap + öppna utredningar + idéer).

### Session 39 (2026-04-25) — Willys-dispatch live + tre buggfixar
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
