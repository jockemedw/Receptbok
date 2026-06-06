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
Inga just nu.

### Öppna utredningar
*(Cookie-refresh-automatiseringen (Fas 4F) är klar och live-verifierad i Session 78 — flyttad ur utredningar.)*

**Willys+ medlemserbjudanden — 3-fas utforskning:**
- **Fas A — Rekon:** Vilka inloggningsmetoder erbjuder willys.se? BankID? E-post+lösenord? "Kom ihåg mig"-cookies? Mobilapp-OAuth?
- **Fas B — Validering:** Logga in manuellt, hämta `https://www.willys.se/search/campaigns/online?q=2160&type=PERSONAL_SEGMENTED&page=0&size=500` i devtools och klistra in svaret. Avgör om Fas C är värd tid.
- **Fas C — Automatiseringsväg:** Väg 1: manuell cookie-export (lätt, skört). Väg 2: scripted login (medelsvårt). Väg 3: BankID — dödsvägen. Väg 4: acceptera anonyma priser, märk UI:t.

### Idéer (användarens)
*(Inga öppna idéer just nu — Mobil bottom-tab-nav implementerad i Session 41.)*

### Claudes idéer
- Offline-stöd via service worker — appen fungerar utan nät (recepten cachas lokalt, synkar vid anslutning)
- "Veckans vinnare"-vy — familjen röstar på bästa receptet varje vecka, bygger favoritdata

### Senaste session — Session 82 (2026-06-06) — Prestanda: upplevd lagg eliminerad (mätt mot live)

Mål: appen ska kännas helt lagg-/laddfri vid öppning och scroll. Mätte baslinjen mot live med Playwright under 4× CPU-strypning (≈ mellanklassmobil), åtgärdade, deployade och ommätte.

- **Rotorsak:** `renderRecipeBrowser()` byggde alla ~262 receptkort *med fulla dolda detaljer* (ingredienser+instruktioner) upfront → **13 340 DOM-noder**, 4 977 dolda `<li>`. Funktionen tog **~1251 ms** under 4× strypning och körs vid **varje sökbokstav, varje filter och vid laddning** → kändes som total frysning.
- **Fix 1 — lazy receptdetalj** (`recipe-browser.js` + `recipe-editor.js`): `renderCard` lämnar `.detail-inner` tom; `ensureDetail(card)` bygger den först vid öppning, flaggar `dataset.rendered`. DOM **13 340 → 4 486 noder (−66%)**, render **1251 → 161 ms (−87%)**. Sök matchar fortfarande på `window.RECIPES`-datan (ej DOM) → ingen regression.
- **Fix 2 — debounce sök** (`app.js`): listan byggs om först 140 ms efter sista tangenttryck. X-knappen uppdateras direkt.
- **Fix 3 — resurs-hints** (`index.html`): `preconnect` gstatic/supabase/jsdelivr + `modulepreload` av Supabase-ESM → snabbare kallstart.
- **Fix 4 — scroll-reflow** (`scroll.js`): cacha header-höjd i variabel (ResizeObserver håller den färsk) ist.f. `offsetHeight` per scroll-frame (tvingad layout).
- **Fix 5 — household-cache** (`supabase-client.js`): `household_id` cachas i localStorage (nyckel `hh:<userId>`) + `getSession` (lokalt) ist.f. `getUser` (nätverk) → tar bort ~590 ms sekventiell runda vid omladdning.
- **Verifierat live (deploy f65b183):** 262 kort, alla detaljer tomma tills öppning, öppnat kort får rätt ingredienser+steg. Matsedel-tidslinjen lätt (60 dagskort, 354 noder). Tester gröna (match 103, dispatch 88, shopping 81, select 432, data-mapper 27). Cache-bust `app.js?v=89`.
- **Not:** Playwright bakgrunds-throttlar `requestAnimationFrame` till 1 fps (idle rAF = 1001 ms oavsett DOM) → scroll-FPS går ej att mäta i harnessen; den enda rena mätningen (innan throttling rörts) gav 7 ms/frame, 0 droppade, redan med den *större* DOM:en. Scroll är alltså inte boven; den lättare DOM:en gör den ändå billigare.

### Session 81 (2026-06-05) — Nattjobb: matchnings-härdning (4 faser, auto-mergat)

Självgående nattjobb i 4 faser, en PR per fas, alla auto-mergade till main. Kod-only, test-gated, ingen live-data rörd. Full rapport: `docs/match-hardening-natt-2026-06-05.md`.
- **Fas 1 — täckning (PR #61):** ~45 nya canon-mappningar (havregryn, couscous, senap/dijonsenap, pastor: spaghetti/makaroner/tagliatelle/fettuccine, alla nudel-typer→`nudlar`, lagerblad, kardemumma, muscovado/farin→`socker`, hasselnötter/pekan/pistasch, kärnmjölk, savojkål/salladskål/palsternacka/sparris/kålrabbi, isbergssallad→`sallad`, edamame, kidneybönor, jordgubbar/blåbär/hallon/päron). CANON_SET → 220. Kategori-fix: kärnmjölk→Mejeri, edamame/kidneybönor→Grönsaker.
- **Fas 2 — reject-härdning (PR #62):** globalt reject breddat till alla icke-ingrediens-klasser (`barnmat|klämmis|ostbågar|kattmat|hundmat|djurfoder` + färdigrätt). `smör`→nötsmör-reject. `lime`/`apelsin`→läsk-reject (juice OK). Ny `tests/match-corpus.test.js` (35 accept/reject-fall) wired i hooken.
- **Fas 3 — självgranskning (PR #63):** moduler sunda; 1 robusthetsfix (`extractOfferCanon`/`rejectsMatch` coercar `offer.name || ""`).
- **Tester:** match 51→103, ny korpus 35. dispatch 81 / shopping 81 / select-recipes 432 / data-mapper 27 oförändrade gröna.
- **Bedömningsfall (väntar på Joakim, se rapport):** (1) ska generisk "grädde" få falla till vispgrädde? (2) ~~potatis/toalettpapper = köpenhet-bugg~~ **FIXAD (PR #65)** — se nedan. (3) full audit av långsvansen kräver Supabase-nätåtkomst (blockerat i nattmiljön).
- **Uppföljning samma session — lösvikts-fix (PR #65):** `addProducts` hårdkodade `pickUnit: "pieces"`. Willys-koder bär enheten i suffixet (`_ST` styck / `_KG` lösvikt). Lös potatis (`_KG`, pris/kg) skickad som "pieces" → 400 `error.illegal.argument` → "kunde inte matchas" trots korrekt träff. Ny `pickUnitForCode(code)` → `"kilograms"` för `_KG`, annars `"pieces"` (oförändrad default = ingen regression för styckvaror). +7 assertions (dispatch 81→88). **Live-verifiera:** vikt-enumet `"kilograms"` är inferred (`"pieces"` PoC-bekräftad); strikt förbättrande oavsett.

### Session 80 (2026-06-04) — Willys-export: felmatchningar + fabrikat-blockering + täckning

- **Bakgrund:** Session 79:s sök-fallback höjde träffarna 27→43, men live-körningen visade tre felmatchningar och en saknad funktion.
- **Runda 2 (live 46 varor, timeout borta):** tre nya felmatchningar fixade. `sallad` → "Salad Endive" (reject `endive|frisé|cikoria|witlof`). `yoghurt` → "Samoa Original Yoghurt" (yoghurt-reject utökat med `samoa|kokos|lakrits|dessert|drick…`). "Mac & Cheese"-färdigrätt → nytt **globalt** `PREPARED_DISH_RE` i `rejectsMatch` (`mac & cheese|färdigrätt|micro|panerad`) som gäller alla canons, eftersom färdigrätter ofta innehåller canon-ord. Kvar omatchat: bara `potatis` + `toalettpapper` (cart-add-enhet, se nedan).
- **Felmatchningar (reject-mönster i `shopping-builder.js`):** sökträffar som innehöll canon-ordet men var fel produktvariant slank igenom exakt-steget:
  - `citron` → "Citron Kolsyrat Vatten" (läsk). Nytt mönster: `kolsyrat|kolsyrad|läsk|soda|smoothie|sirap|nektar`.
  - `yoghurt` → "Körsbär Yoghurt" (smaksatt). Nytt mönster: fruktsmaker (körsbär/jordgubb/hallon/vanilj…). "Turkisk yoghurt" är egen canon → opåverkad.
  - `mjölk` → "Kondenserad mjölk". Utökat mönster: `kondenserad|mjölkpulver|mjölkfri`.
- **Fabrikat-blockering (önskemål):** blocklistan i Inköpspreferenser användes bara i AI-prompten, aldrig i "Skicka till Willys". Nu läser `dispatch-to-willys.js` `dispatch-preferences.json` (`fetchBlockedBrands()`) och trådar `blockedBrands` genom `matchCanons` (rea) + `createSearchClient` (sök). Ny `brandBlocked(offer, brands)` i `willys-matcher.js` matchar på namn + brandLine. Blockerad rea-vara faller automatiskt till sök efter ej-blockerat alternativ.
- **Täckning (lexikon i `shopping-builder.js`):** `frysta gröna ärter`→`ärtor`, `lätt färskost`→`färskost` (+ Mejeri-kategori), `kycklingbröst …`→`kycklingfilé`, `bananer`→`banan`, `toalettpapper`/`hushållspapper` self-canon (→ exakt-steg istället för fallback).
- **Timeout-fix (samma session):** fler matchningar (43+) gjorde att ~40 separata "lägg i korg"-anrop + ~60 sökningar översteg 60s-taket. Åtgärd i `dispatch-to-willys.js`: (1) `addProductsInBatches()` ersätter en-i-taget — lägger 8 varor per anrop, splittrar bara en *nekad* batch till en-i-taget (bevarar allt-eller-inget-isoleringen). (2) sök-parallellitet 6→10 (publika läsningar). Partiellt-lyckat-testet uppdaterat till realistisk allt-eller-inget-mock.
- **Tester:** match 60→78, dispatch 77→81. shopping 81 / select-recipes 432 / data-mapper 27 oförändrade gröna.
- **Kvar (ej fixat):** `potatis` matchar troligen men add:en faller — lös färskvara prissätts per kg, men `addProducts` skickar `pickUnit: "pieces"` → 400 → hamnar i "kunde inte matchas". Kräver pick-unit per produkt från sökresultatet. Separat live-diagnos.

### Session 79 (2026-06-04) — Bättre matchnings-täckning vid Willys-export (sök-fallback)

- **Bakgrund:** Session 78:s skarpa körning hade 24 omatchade varor. Vanliga varor (färs, banan, toalettpapper m.fl.) hamnade aldrig i korgen.
- **Rotorsak:** Sök-fallbacken i `willys-search.js` krävde att produktens **återextraherade canon var exakt lika** med sök-canonen (`extractOfferCanon(result) === canon`). För strikt: när vi aktivt söker Willys på en term är topp-träffen nästan alltid rätt produkt, även om dess namn stemmar till en **annan** canon ("färs" → "Nötfärs" → `köttfärs`) eller till **ingen** canon ("banan", "toalettpapper") → `extractOfferCanon` ger `null` → avvisas.
- **Fix — tvåstegs-sök** (`willys-search.js`): Steg 1 behåller exakt canon-likhet (skyddar `vitlöksklyftor` → "Lök Vit Stor" och `grädde` → spraygrädde). Steg 2 är en **relevans-fallback**: om inget exakt-canon-träff finns, ta första köpbara, ej avvisade träff vars namn delar ordstam med sök-termen. `rejectsMatch` gäller i båda stegen. Sök-storlek 10→20 (fler kandidater för exakt-steget).
- **`relevantToCanon(canon, text)`** (ny, `willys-matcher.js`): canon-token (≥4 tecken) ska dela ordstam med produkt-token (identisk / prefix / suffix). Fångar sammansättningar (nötFÄRS) + plural (BANANer ⊃ banan), men avvisar korta/felplacerade deltoken ("vit"/"lök" ⊄ "vitlöksklyftor").
- **Tester:** match 51→60, dispatch 74→77. shopping 81 / select-recipes 432 / data-mapper 27 oförändrade gröna.
- **Kvar:** ren live-körning för att mäta ny täckning. Lexikon-utökning för vanlig färskvara (självcanons) kan höja exakt-steget ytterligare — ej akut.

### Session 78 (2026-06-04) — Fas 4F slutförd: "Skicka till Willys" live (27 varor i korgen)

- **Bakgrund:** Användaren ville slutföra Fas 4F (cookie-refresh + dispatch). Visade sig att server-setupen (gist + env vars) redan fanns sedan Session 42 — bara extension-installation + felsökning återstod.
- **Felsökning i ordning (varje fix egen squash-PR mot main):**
  1. **Timeout** (PR #48): `matchCanons` körde sök-anrop sekventiellt → 20s+. Parallelliserat med bounded concurrency (6). +`maxDuration` på dispatch.
  2. **Auth 401** (diagnos via DIAG/CK-loggar runt Vercel-loggtrunkering): cookie-setet var komplett (`JSESSIONID`+`axfoodRememberMe`) men sessionen **inaktuell** i gisten. "Uppdatera nu" i extensionen löste det. Inga Akamai/bot-cookies (replay funkar i princip).
  3. **400 error.illegal.argument** (PR #54): Willys `addProducts` är **allt-eller-inget** — en ogiltig kod sänker hela batchen. Fix: `addProductsOneByOne()` lägger varje produkt separat (concurrency 6), giltiga hamnar i korgen, ogiltiga → `missing`. +partiellt-lyckat-test.
  4. **FUNCTION_INVOCATION_TIMEOUT** (PR #55): per-produkt + sök översteg 15s. maxDuration 15→60, frontend-abort 20s→60s, cache-bust `app.js?v=88`.
- **Resultat:** skarp körning → `addedCount: 27` (6 rea + 21 sök), 24 omatchade (matchnings-täckning, separat). All tillfällig diagnostik bortstädad.
- **Tester:** dispatch 70→74 assertions. match/shopping/select-recipes/data-mapper oförändrade gröna.
- **Kvar att förbättra (ej akut):** matchnings-täckningen — vanliga varor som färs, potatis, bananer, toalettpapper matchade inte (Fas 1D). Dashboard-omstrukturering påbörjades men pausades för 4F.

### Session 77 (2026-06-03) — Ingrediens-kvalitetskontroll: plan + audit-verktyg (Fas 8.0)

- **Bakgrund:** Mål att minska problem vid generering av ingrediens-/inköpslistor. En optimal ingrediens har definierbar mängd (antal/vikt/volym).
- **Nyckelfynd:** `recipes.json` (263 recept) har glidit isär från Supabase (262 recept, id upp till 271). Inget i runtime läser filen — Supabase är sanningskällan. Beslut (användaren): städa i Supabase, **retirera `recipes.json` helt**.
- **Audit (`scripts/audit-ingredients.mjs`):** läser live från Supabase REST (eller `--source`-export), klassar 3 791 rader i 5 problemklasser med severity. Beroendefritt (plain `fetch`). Baseline: **P0=1** (`⅔ dl olivolja` — fraktionsbugg), **P1=309** (saknad mängd + flerradiga), **P2=1372** (567 icke-canon-namn + brus). "Namn (mängd)"-format räknas ej som defekt (parsern hanterar det).
- **Levererat:** plan `docs/ingredient-qc-plan-2026-06-03.md`, verktyg + rapport `docs/ingredient-audit-2026-06-03.md` + `ingredient-audit-latest.json`. PR #47.
- **Fas 8.1 + 8.2 (samma session):** Fraktionsfix (⅓⅔⅛) — P0 1→0, +5 assertions. Canon-utökning ~80 mappningar — täckning 17%→30%, P2 1372→728, C1 1294→517. Tester gröna (match 51, shopping 67, select-recipes 432).
- **Fas 8.3 (samma session):** Dry-run-analysen visade att merparten av P1 var (a) mängd i senare parentes/klausul som parsern missade och (b) falska positiva (adjektiv-"och", valfria garneringar) — **inte** äkta dataluckor. Löste därför i kod: doh-parsern skannar alla parenteser + "ca/från/+/storleksadjektiv"; audit hoppar vaga/valfria + adjektiv-"och". **P1 309→68 utan att röra live-datan** (säkrast). +14 assertions (shopping 81/81). De 68 kvarvarande är genuin författar-vaghet och renderas acceptabelt i listan.
- **Fas 8.4 (samma session):** `recipes.json` retirerad (hade glidit isär från Supabase). Ny delad källa `scripts/_lib/recipes-source.mjs` (REST, beroendefri) + `export-recipes.mjs` → gitignorerad cache som synkrona läsare/Python använder. Import-pipelinen (`scrape`/`promote`) skriver nu direkt till Supabase (dry-run-stöd kvar). 5 obsoleta engångsskript spärrade med tydligt meddelande. Kanoniskt ingrediensformat dokumenterat i CLAUDE.md. **Fas 8 helt klar.**
- **Resultat hela Fas 8:** P0 1→0, P1 309→68, P2 1372→772, canon-täckning 17%→30%, tester 545→564. Ingen live-data muterad.

### Session 76 (2026-06-03) — Flytta-knappen göms i ihopfälld ingredienssektion

- **Önskemål:** "Flytta till inköpslista"-knappen syntes alltid under ingredienssektionen, även när ingredienslistan var ihopfälld. Skulle döljas inom respektive ingredienslista.
- **Rotorsak:** `#flyttaBtn` låg utanför den hopfällbara `.ingredient-section-body` → `max-height`-kollapsen påverkade aldrig knappen.
- **Fix:** flyttade in knappen i `.ingredient-section-body` (index.html) + `padding-bottom: 1.2rem` på öppen sektion (css). Normal vy = ihopfälld → knappen dold; vid ny plan auto-expanderas sektionen (`expand=true`) → knappen syns. Ingen JS-ändring (`renderIngredientPreview` oförändrad).
- **Cache-bust:** `css/styles.css?v=92`.

### Session 75 (2026-06-02) — Säsongsanpassning syntes inte i räknaren

- **Symptom:** "Säsongsanpassning"-toggeln kändes som att den inte gjorde något — antalet recept "inom filtret" ändrades inte när den slogs på.
- **Rotorsak (två delar):** (1) `seasonWeight`-kryssrutan saknade `onchange` → triggade aldrig omräkning. (2) Räknaren "X recept matchar dina filter" (`updateSettingsPreview`) tittade bara på protein/oprövat/måltidstaggar, aldrig på säsong. Dessutom är säsong **medvetet en mjuk viktning** (2×/1×/0,5×, Fas 6C), inte ett hårt filter — den tar aldrig bort recept, så antalet kan inte sjunka.
- **Beslut (användaren):** behåll mjuk viktning (ingen risk att genereringen slår i taket vissa årstider), men **gör effekten synlig**.
- **Fix:** `onchange="updateSettingsPreview()"` på toggeln + ny `seasonForDate()` (samma indelning som backendens `getCurrentSeason`). När toggeln är på visar räknaren `… · Y i säsong (sommaren)`.
- **Verifierat:** `node --check` på `plan-generator.js`; frontend-säsongslogiken jämförd rad-för-rad mot `api/generate.js`; Supabase-data kontrollerad (240 taggade recept, värden `vår/sommar/höst/vinter`).
- **Cache-bust:** `js/app.js?v=87` (CSS oförändrad).

### Session 74 (2026-06-02) — Buggfix: namnändring i inköpslistan sparades inte

- **Rotorsak:** `renameShopItem` gjorde `parseInt(inputEl.dataset.id, 10)` — men `shopping_items.id` är en **UUID-sträng**, inte ett heltal. `parseInt` stympade UUID:n till ett meningslöst tal → `.update().eq('id', …)` matchade ingen rad (0 uppdaterade, inget fel) → namnet sparades aldrig och `updateNameInMemory` hittade inget → texten snäppte tillbaka. (Borttagning fungerade eftersom den använde id-strängen direkt utan `parseInt`.)
- **Fix:** använd `inputEl.dataset.id` som sträng rakt av. Dessutom uppdateras minnet nu **optimistiskt före** DB-anropet, så att en re-render (t.ex. "✓ Klar") visar nya namnet direkt istället för att tävla med den asynkrona sparningen; återställning sker bara vid faktiskt DB-fel.
- **Verifierat:** RLS tillåter UPDATE (members-policy på `shopping_items` via `list_id`→household). shopping-testet oförändrat.
- **Cache-bust:** `js/app.js?v=86` (CSS oförändrad, v=91).

### Session 73 (2026-06-02) — Inköpslista: redigerbar varutext i redigera-läge

- **Önskemål:** I redigera-läget ska man kunna ändra en varas text till vad man vill.
- **`itemTextCell(name, rowId)`** (ny): renderar ett `<input class="item-edit-input">` i redigera-läge (annars `<span class="item-text">`). Gäller både recept- och manuella varor.
- **`renameShopItem(inputEl)`** (ny): `onchange`/Enter → uppdaterar `shopping_items.name` (via `data-id`) + minne, utan omladdning. Recept: bara `rebuildShopText()` (positionsnycklar opåverkade). Manuella: full re-render (textbaserade nycklar måste räknas om). `updateNameInMemory()` migrerar manuella bock-nycklar.
- **`toggleEditMode`** re-renderar nu så text↔fält växlar.
- **XSS-härdning:** eftersom varunamn nu är användarredigerbara escapas receptvarornas text överallt (tidigare oescapad `${item}`), samt i kopiera-listan-HTML (`shop-text-items`). Klippbordstexten (`_fullText`) förblir rå.
- **Cache-bust:** `css/styles.css?v=91`, `js/app.js?v=85`. shopping-testet 62/62.

### Session 72 (2026-06-02) — Inköpslista: borttagning på plats + stabil kategoriordning

- **Önskemål:** Borttagen ingrediens ska försvinna utan att sidan laddas om, och kategoriordningen (t.ex. Mejeri) ska inte ändras.
- **Rotorsak:** `removeShopItem`/`removeManualItem` körde `loadShoppingTab()` (full DB-omladdning). `buildShopState` byggde kategoriordning från `.order('position')` — men `position` är per-kategori, så lika värden tie-breakas icke-deterministiskt av Postgres → kategorierna hoppade om vid varje omladdning. Dessutom triggade realtime-DELETE en *till* `loadShoppingTab()`.
- **Fix:** `applyRemovalById(id)` (ny) tar bort varan ur in-memory-state, re-keyar receptvarornas index kontigerligt och re-renderar från minnet (`renderFullShoppingList`) — ingen DB-fetch, ingen omladdning. `removeShopItem`/`removeManualItem` använder den. Realtime-`DELETE` gör samma sak på plats (lokala borttagningar blir no-op).
- **Stabil ordning:** `CATEGORY_ORDER` + `sortCategories()` i `buildShopState` → kanonisk ordning (Mejeri, Grönsaker, Fisk & kött, Frukt, Skafferi, Övrigt) även vid full laddning.
- **Cache-bust:** `js/app.js?v=84` (CSS oförändrad). shopping-testet 62/62.

### Session 71 (2026-06-02) — "Gör fri dag" / "Ångra fri dag" (free/unfree)

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
