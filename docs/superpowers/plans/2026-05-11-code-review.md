# Kodgranskning — Receptbok

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Systematisk kodgranskning av hela kodbasen (~7 800 rader JS + 3 260 rader CSS + 510 rader HTML) för att hitta buggar, dead code, säkerhetsproblem, inkonsistenser och förbättringsmöjligheter.

**Architecture:** 8 parallella Sonnet-agenter granskar var sin avgränsad del av kodbasen. Varje agent producerar en strukturerad rapport i `docs/review/`. Rapporterna konsolideras sedan till en sammanfattning med prioriterade åtgärder.

**Tech Stack:** Vanilla JS (ES modules via `<script type="module">`), Vercel serverless functions, GitHub API för persistens.

---

## Granskningsmall (alla agenter följer denna)

Varje agent ska granska sin tilldelade kod och rapportera fynd i **exakt denna struktur**:

```markdown
# Review: [Område]

## Kritiska buggar
Fel som kan krascha appen eller ge felaktigt resultat i produktion.
- **[Fil:rad]** — Beskrivning + föreslagen fix

## Potentiella buggar
Kod som sannolikt fungerar men har edge-case-risker.
- **[Fil:rad]** — Beskrivning + scenario

## Dead code
Funktioner, variabler, importer eller CSS-regler som aldrig används.
- **[Fil:rad]** — Vad + varför det är dött

## Säkerhet
Injection-risker, okontrollerad input, exponerad data.
- **[Fil:rad]** — Beskrivning + allvarlighetsgrad (hög/medel/låg)

## Inkonsistenser
Namngivning, mönster eller konventioner som bryts.
- **[Fil:rad]** — Vad + vad det borde vara

## Förbättringsförslag
Enklare kod, bättre prestanda, tydligare struktur. Ej refactoring-for-its-own-sake.
- **[Fil:rad]** — Vad + varför det är bättre

## Testtäckning
Logik som saknar tester och som borde ha det.
- **[Fil:funktion]** — Vad som borde testas + varför
```

**Regler:**
- Rapportera bara fynd du har **hög konfidens** i. Inga "kanske"-observationer.
- Varje fynd måste ha **exakt fil:rad** och en **konkret beskrivning** (ej "den här funktionen är komplex").
- Ignorera stilistiska preferenser (semikolon, quotes, etc.) — projektet har ingen linter.
- Ignorera avsaknad av TypeScript — projektet är medvetet vanilla JS.
- Tänk på att appen kör i **två miljöer**: browser (frontend) och Node.js/Vercel serverless (backend). `window.*` finns bara i frontend.
- `recipes.json` läses via GitHub raw URL (CDN-cachad ~60s) i frontend, via GitHub API (okachad) i backend.
- Alla API-endpoints wrappas av `handler.js` som ger CORS + error-handling — leta inte efter saknad CORS i enskilda endpoints.

---

## Task 1: Backend-kärna — receptval + inköpslistbyggare

**Syfte:** Granska den kritiska affärslogiken: hur recept väljs och inköpslistan byggs.

**Filer att granska:**
- `api/generate.js` (435 rader) — receptval, proteinfördelning, historikfilter, prisoptimering, ture-dagar
- `api/_shared/shopping-builder.js` (505 rader) — ingrediens-parsing, normalisering, kategorisering, merge
- `api/_shared/history.js` (40 rader) — historikhantering
- `api/_shared/constants.js` (3 rader) — delade konstanter

**Kontextfiler att läsa (granska ej):**
- `api/_shared/handler.js` — förstå wrappern
- `api/_shared/github.js` — förstå GitHub API-anrop
- `CLAUDE.md` — sektionerna "Tekniska beslut" och "recipes.json — struktur"

**Fokusområden:**
- `selectRecipes()` i generate.js: korrekthet i loop-strukturen (5 loopar med fallback). Respekteras `ture_days`, `veg_days`, `untested_count`, `locked_days`, `blocked_days` korrekt i alla loopar?
- `bucketBySaving()`: sorterar den verkligen recept med ≥10 kr besparing först? Edge case: vad händer med 0 erbjudanden?
- `parseIngredient()` i shopping-builder.js: bråk-hantering (`½`, `1/2`), eller-mönster (`1 dl grädde, eller creme fraiche`), enhetsdetektering
- `categorize()`: ordmängd-matchning vs substring — finns det kvarvarande substring-buggar?
- `mergeItems()`: sammanslår den korrekt vid olika enheter (2 dl + 100 ml)?
- Race conditions: SHA-hantering vid parallella skrivningar till GitHub

- [ ] **Steg 1:** Läs kontextfilerna (`handler.js`, `github.js`, CLAUDE.md-sektionerna)
- [ ] **Steg 2:** Granska `api/generate.js` rad för rad. Notera alla fynd.
- [ ] **Steg 3:** Granska `api/_shared/shopping-builder.js` rad för rad. Notera alla fynd.
- [ ] **Steg 4:** Granska `api/_shared/history.js` och `api/_shared/constants.js`.
- [ ] **Steg 5:** Skriv rapporten till `docs/review/01-backend-core.md` med exakt mallen ovan.
- [ ] **Steg 6:** Committa: `git add docs/review/01-backend-core.md && git commit -m "review: backend-kärna (receptval + inköpslista)"`

---

## Task 2: Willys-integration — dispatch + matchning + sökning

**Syfte:** Granska hela Willys-integrationspipelinen: erbjudande-matchning, varukorgsdispatch, cookie-hantering.

**Filer att granska:**
- `api/dispatch-to-willys.js` (237 rader) — dispatch-endpoint, cookie-refresh
- `api/willys-offers.js` (132 rader) — hämtar Willys-erbjudanden
- `api/_shared/willys-matcher.js` (80 rader) — matchar ingredienser mot erbjudanden
- `api/_shared/willys-search.js` (46 rader) — söker Willys-produkter
- `api/_shared/willys-cart-client.js` (67 rader) — lägger i Willys-varukorg
- `api/_shared/dispatch-matcher.js` (58 rader) — matchar canons mot sökresultat
- `api/_shared/secrets-store.js` (87 rader) — gist-backed secret-lagring

**Kontextfiler att läsa (granska ej):**
- `api/_shared/handler.js`
- `api/_shared/github.js`
- `tests/dispatch-to-willys.test.js` — förstå testade scenarios
- `tests/match.test.js` — förstå matchningsregressioner

**Fokusområden:**
- `CANON_REJECT_PATTERNS`: täcker de alla kända false-positive-fall? Finns det mönster som kan rejecta korrekta matcher?
- `normalizeName()`: adjektiv-strip + token-scan + n-gram — kan den stripa bort meningsfulla ord?
- Cookie/CSRF-hantering: loggas känsliga headers? Exponeras de i felmeddelanden?
- `secrets-store.js`: race condition vid parallella writes till samma gist? Cache-invalidering?
- Felhantering vid Willys API-nertid: timeouts, retry-logik, meningsfulla felmeddelanden?
- `extractOfferCanon()` vs `extractSearchCanon()`: kan de ge olika resultat för samma produkt?

- [ ] **Steg 1:** Läs kontextfilerna (handler, github, tester)
- [ ] **Steg 2:** Granska `api/_shared/willys-matcher.js` och `api/_shared/dispatch-matcher.js` — matchningslogiken.
- [ ] **Steg 3:** Granska `api/_shared/willys-search.js` och `api/_shared/willys-cart-client.js` — externa API-anrop.
- [ ] **Steg 4:** Granska `api/_shared/secrets-store.js` — secret-hantering och caching.
- [ ] **Steg 5:** Granska `api/dispatch-to-willys.js` och `api/willys-offers.js` — endpoints.
- [ ] **Steg 6:** Skriv rapporten till `docs/review/02-willys-integration.md`.
- [ ] **Steg 7:** Committa: `git add docs/review/02-willys-integration.md && git commit -m "review: Willys-integration (dispatch + matchning)"`

---

## Task 3: API-endpoints — CRUD + import

**Syfte:** Granska alla övriga API-endpoints: recepthantering, dag-operationer, import.

**Filer att granska:**
- `api/import-recipe.js` (289 rader) — receptimport via URL/foto (Gemini API)
- `api/replace-recipe.js` (125 rader) — byter recept på en dag
- `api/recipes.js` (66 rader) — CRUD för recept
- `api/shopping.js` (52 rader) — shopping-actions (get/set preferences)
- `api/confirm.js` (47 rader) — bekräftar genererad plan
- `api/custom-days.js` (50 rader) — anpassade dagar (notering/recept)
- `api/discard-plan.js` (50 rader) — kasserar obekräftad plan
- `api/skip-day.js` (100 rader) — hoppar över/blockerar dag
- `api/swap-days.js` (34 rader) — byter ordning på två dagar
- `api/_shared/github.js` (59 rader) — GitHub API wrapper med 3-retry SHA
- `api/_shared/handler.js` (24 rader) — CORS + error-wrapping

**Fokusområden:**
- `import-recipe.js`: Gemini API-anrop — sanitiseras response korrekt? Kan prompt injection via recepttext nå Gemini?
- `github.js`: SHA retry-logik — kan den hamna i oändlig loop? Hanteras 404 korrekt?
- Inputvalidering: accepterar endpoints ogiltig JSON? Oväntade fält? Extremt stora payloads?
- `replace-recipe.js`: uppdateras historiken korrekt vid byte? Kan den orsaka dubbla recept samma dag?
- `skip-day.js` unblock-action: skjuter den ihop matsedeln korrekt? Edge case: blocka sista dagen?
- `confirm.js`: race condition om två enheter bekräftar samtidigt?

- [ ] **Steg 1:** Läs `handler.js` och `github.js` först — de wrappas runt alla endpoints.
- [ ] **Steg 2:** Granska `api/import-recipe.js` noggrant (störst + extern AI-integration).
- [ ] **Steg 3:** Granska `api/replace-recipe.js` och `api/skip-day.js` (dag-operationer).
- [ ] **Steg 4:** Granska `api/confirm.js`, `api/discard-plan.js`, `api/custom-days.js`, `api/swap-days.js`, `api/recipes.js`, `api/shopping.js`.
- [ ] **Steg 5:** Skriv rapporten till `docs/review/03-api-endpoints.md`.
- [ ] **Steg 6:** Committa: `git add docs/review/03-api-endpoints.md && git commit -m "review: API-endpoints (CRUD + import)"`

---

## Task 4: Frontend — veckoplansvyn (den stora)

**Syfte:** Granska den största frontend-modulen + tillhörande stödfiler.

**Filer att granska:**
- `js/weekly-plan/plan-viewer.js` (1 293 rader) — hela veckovyn: tidslinje, kort, swap, skip, block, custom-days, arkiv
- `js/weekly-plan/plan-generator.js` (266 rader) — inställningspanel + genererings-UI
- `js/weekly-plan/ingredient-preview.js` (64 rader) — ingrediensvisning per dag

**Kontextfiler att läsa (granska ej):**
- `js/state.js` — globala variabler
- `js/utils.js` — delade hjälpare
- `js/app.js` — entry point, förstå init-ordning
- `index.html` — HTML-struktur

**Fokusområden:**
- `plan-viewer.js` är 1 293 rader — leta efter: duplicerad logik, funktioner som borde extraheras, event listeners som läcker (aldrig `removeEventListener`)
- DOM-manipulation: `innerHTML` med användardata (recept-titlar) — XSS-risk?
- Tidshantering: `new Date()`-parsing av ISO-strängar — tidszons-buggar? Off-by-one vid veckovisning?
- `data-past`-attribut: blockeras farliga operationer korrekt på förflutna dagar?
- Swap-logik: kan man swappa en dag med sig själv? Swappa blockerad dag?
- Arkivvy vs aktiv plan: kan operationer på arkiverade planer mutera aktiv data?
- Memory leaks: event listeners som binds vid varje rendering utan cleanup?
- `plan-generator.js`: valideras inställningar korrekt? Kan `ture_days > total_days`?

- [ ] **Steg 1:** Läs kontextfilerna (`state.js`, `utils.js`, `app.js`, `index.html`).
- [ ] **Steg 2:** Granska `js/weekly-plan/plan-viewer.js` rad 1–400 (rendering + tidslinje).
- [ ] **Steg 3:** Granska `js/weekly-plan/plan-viewer.js` rad 400–800 (dag-interaktioner: swap, skip, block).
- [ ] **Steg 4:** Granska `js/weekly-plan/plan-viewer.js` rad 800–1293 (custom-days, arkiv, hjälpfunktioner).
- [ ] **Steg 5:** Granska `js/weekly-plan/plan-generator.js` och `js/weekly-plan/ingredient-preview.js`.
- [ ] **Steg 6:** Skriv rapporten till `docs/review/04-frontend-weekplan.md`.
- [ ] **Steg 7:** Committa: `git add docs/review/04-frontend-weekplan.md && git commit -m "review: frontend veckoplansvyn"`

---

## Task 5: Frontend — recepthantering

**Syfte:** Granska receptbrowser, recepteditor och receptimport-UI.

**Filer att granska:**
- `js/recipes/recipe-browser.js` (297 rader) — sökning, group-by, filter, FAB-stack
- `js/recipes/recipe-editor.js` (220 rader) — redigera/skapa recept
- `js/recipes/recipe-import.js` (163 rader) — importera via URL/foto

**Kontextfiler att läsa (granska ej):**
- `js/state.js`, `js/utils.js`, `js/app.js`
- `index.html` — HTML-element som refereras

**Fokusområden:**
- `recipe-browser.js`: sökning mot `window.RECIPES` — prestanda med 259 recept? `GROUP_DEFS` — korrekta grupperingar?
- Filter-logik: kombineras filter korrekt (AND vs OR)? Säsongsfilter + taggfilter + sök samtidigt?
- `recipe-editor.js`: valideras input korrekt? Kan man spara recept med tomma fält? Max-längder?
- `recipe-import.js`: hanteras Gemini-fel i UI:t? Visas laddningsindikator? Kan dubbelklick trigga dubbel import?
- Bottom-sheets (Sortera/Filter): scroll-lock via position-fixed — fungerar det i alla browsers? Memory leak vid repeated open/close?
- `window.activeFilters` — nämns som "bevarad oanvänd för bakåtkompat" — är den verkligen oanvänd?

- [ ] **Steg 1:** Läs kontextfilerna.
- [ ] **Steg 2:** Granska `js/recipes/recipe-browser.js` — sökning, filtrering, rendering.
- [ ] **Steg 3:** Granska `js/recipes/recipe-editor.js` — CRUD-UI.
- [ ] **Steg 4:** Granska `js/recipes/recipe-import.js` — import-flöde.
- [ ] **Steg 5:** Skriv rapporten till `docs/review/05-frontend-recipes.md`.
- [ ] **Steg 6:** Committa: `git add docs/review/05-frontend-recipes.md && git commit -m "review: frontend recepthantering"`

---

## Task 6: Frontend — inköpslista + dispatch-UI

**Syfte:** Granska inköpsliste-UI, dispatch-preferenser och Willys-dispatch-UI.

**Filer att granska:**
- `js/shopping/shopping-list.js` (296 rader) — inköpslista-rendering, checkbox, manuella tillägg
- `js/shopping/dispatch-preferences.js` (247 rader) — varumärkesblocklist, eko/svenskt-toggle
- `js/shopping/dispatch-ui.js` (126 rader) — Willys-dispatch bekräftelse + status

**Kontextfiler att läsa (granska ej):**
- `js/state.js`, `js/utils.js`, `js/app.js`
- `index.html`

**Fokusområden:**
- `shopping-list.js`: checkbox-state — bevaras den vid re-render? `shopNoData` med dubbla ID-set (`*` + `*Empty`) — finns risk för ID-kollision?
- Manuella tillägg: sanitiseras input? Max-längd? Vad händer vid tomt fält + klick?
- `dispatch-preferences.js`: sparas preferenser korrekt via API? Laddas de vid sidladdning? Race condition vid snabba ändringar?
- `dispatch-ui.js`: Willys-dispatch polling — kan den polla i oändlighet? Timeout?
- "Kopiera AI-inköpsprompt"-knappen: byggs prompten korrekt? Inkluderas bara oavbockade varor?
- Tillgänglighet: har checkboxar labels? Keyboard-navigerbar?

- [ ] **Steg 1:** Läs kontextfilerna.
- [ ] **Steg 2:** Granska `js/shopping/shopping-list.js`.
- [ ] **Steg 3:** Granska `js/shopping/dispatch-preferences.js`.
- [ ] **Steg 4:** Granska `js/shopping/dispatch-ui.js`.
- [ ] **Steg 5:** Skriv rapporten till `docs/review/06-frontend-shopping.md`.
- [ ] **Steg 6:** Committa: `git add docs/review/06-frontend-shopping.md && git commit -m "review: frontend inköpslista + dispatch"`

---

## Task 7: Frontend infrastruktur — app, utils, navigation, CSS, HTML

**Syfte:** Granska app-entry, delade utilities, navigation, CSS-designsystem, och HTML-markup.

**Filer att granska:**
- `js/app.js` (182 rader) — entry point, tab-switching, init
- `js/state.js` (21 rader) — globala variabler
- `js/utils.js` (168 rader) — delade hjälpare
- `js/ui/navigation.js` (20 rader) — bottom-nav
- `js/ui/scroll.js` (57 rader) — scroll-to-top, scroll-helpers
- `css/styles.css` (3 259 rader) — hela designsystemet
- `index.html` (510 rader) — HTML-struktur + script-tags

**Fokusområden:**
- `app.js` init-ordning: laddas moduler i rätt ordning? Finns race conditions vid DOMContentLoaded?
- `state.js`: vilka globala variabler finns? Dokumenteras de? Namnkollisioner med window-objekt?
- `utils.js`: dupliceras funktioner som finns i andra moduler? Oväntade sidoeffekter?
- `css/styles.css`: oanvända CSS-regler (selectors som inte matchar något i HTML)? Inkonsistenta tokens? `!important`-missbruk? Media queries som överlappar?
- `index.html`: saknade `aria`-attribut? Semantisk HTML? Script-ordning korrekt? Duplicerade ID:n?
- Designsystem-tokens (`:root`): används alla 14 tokens? Refereras gamla token-namn (--cream, --terracotta) fortfarande?
- `env(safe-area-inset-*)` — används konsekvent? Saknas på något element?
- Cache-bust `?v=`-parameter: är den samma på alla script/CSS-inkluderingar?

- [ ] **Steg 1:** Läs `index.html` och `js/state.js` för att förstå övergripande struktur.
- [ ] **Steg 2:** Granska `js/app.js`, `js/utils.js`, `js/ui/navigation.js`, `js/ui/scroll.js`.
- [ ] **Steg 3:** Granska `index.html` — semantik, tillgänglighet, script-ordning, duplicerade ID:n.
- [ ] **Steg 4:** Granska `css/styles.css` rad 1–1600 (tokens, layout, komponenter).
- [ ] **Steg 5:** Granska `css/styles.css` rad 1600–3259 (media queries, bottom-sheet, animations).
- [ ] **Steg 6:** Skriv rapporten till `docs/review/07-frontend-infra.md`.
- [ ] **Steg 7:** Committa: `git add docs/review/07-frontend-infra.md && git commit -m "review: frontend infrastruktur (app, CSS, HTML)"`

---

## Task 8: Testsvit — täckning, kvalitet, flaky-risker

**Syfte:** Granska alla testfiler för testkvalitet, täckningsluckor, och risker för flaky-tester.

**Filer att granska:**
- `tests/select-recipes.test.js` (621 rader) — inline-kopia av `selectRecipes` + tester
- `tests/dispatch-to-willys.test.js` (483 rader) — dispatch-tester
- `tests/shopping.test.js` (289 rader) — inköpslista-tester
- `tests/cookies-endpoint.test.js` (267 rader) — cookie-refresh-tester
- `tests/match.test.js` (182 rader) — matchnings-regressionstester

**Kontextfiler att läsa (granska ej):**
- `api/generate.js` — jämför med inline-kopian i `select-recipes.test.js`
- `api/_shared/shopping-builder.js` — jämför med testade scenarios
- `api/_shared/willys-matcher.js` — jämför med testade scenarios

**Fokusområden:**
- **Inline-kopian i select-recipes.test.js**: är den synkad med `api/generate.js`? Diffa dem rad för rad. Alla ändringar i generate.js sedan kopian skapades som inte speglas i testet = kritisk bugg.
- Slumpbaserade tester (t.ex. "kör 20 iterationer"): kan de flaka? Finns det seed-kontroll?
- Assertions: testas rätt sak? `toBe` vs `toEqual` — objektjämförelser?
- Edge cases: testas tomma listor? Null-input? Extremt stora inputs?
- Testdata: hårdkodas rimliga testdata eller mockas de på ett sätt som döljer buggar?
- Saknade tester: vilka funktioner i production-koden har **inga** tester alls? Prioritera de mest riskfyllda.

- [ ] **Steg 1:** Diffa `selectRecipes`-funktionen i `tests/select-recipes.test.js` mot `api/generate.js` — leta efter divergens.
- [ ] **Steg 2:** Granska `tests/select-recipes.test.js` — testkvalitet, edge cases.
- [ ] **Steg 3:** Granska `tests/dispatch-to-willys.test.js` — testkvalitet, edge cases.
- [ ] **Steg 4:** Granska `tests/shopping.test.js` och `tests/match.test.js`.
- [ ] **Steg 5:** Granska `tests/cookies-endpoint.test.js`.
- [ ] **Steg 6:** Skriv rapporten till `docs/review/08-test-suite.md`.
- [ ] **Steg 7:** Committa: `git add docs/review/08-test-suite.md && git commit -m "review: testsvit (täckning + kvalitet)"`

---

## Task 9: Konsolidering (körs efter task 1–8)

**Syfte:** Samla alla 8 rapporter till en prioriterad åtgärdslista.

**Filer att läsa:**
- `docs/review/01-backend-core.md`
- `docs/review/02-willys-integration.md`
- `docs/review/03-api-endpoints.md`
- `docs/review/04-frontend-weekplan.md`
- `docs/review/05-frontend-recipes.md`
- `docs/review/06-frontend-shopping.md`
- `docs/review/07-frontend-infra.md`
- `docs/review/08-test-suite.md`

- [ ] **Steg 1:** Läs alla 8 rapporter.
- [ ] **Steg 2:** Skapa `docs/review/00-summary.md` med:
  - **P0 — Fixa nu:** Kritiska buggar och säkerhetsproblem
  - **P1 — Fixa snart:** Potentiella buggar med realistiska edge cases
  - **P2 — Förbättra:** Dead code, inkonsistenser, förbättringsförslag
  - **P3 — Testtäckning:** Saknade tester, inline-kopia-divergens
  - Total statistik: antal fynd per kategori, per modul
- [ ] **Steg 3:** Committa: `git add docs/review/00-summary.md && git commit -m "review: konsoliderad sammanfattning"`
