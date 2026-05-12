# Kodgranskning — Konsoliderad sammanfattning

Granskning utförd 2026-05-12 av 8 parallella Sonnet-agenter.
Kodbas: ~7 800 rader JS + 3 260 rader CSS + 510 rader HTML.

---

## P0 — Fixa nu

Kritiska buggar och säkerhetsproblem som påverkar produktion idag.

### Buggar

| # | Fil:rad | Beskrivning | Rapport |
|---|---------|-------------|---------|
| 1 | `api/generate.js:69–78` | **Säsongsoptimeringen har ingen effekt.** `fetchRecipes()` mappar aldrig `seasons`-fältet → `applySeasonWeight()` ser alltid `undefined` → alla 242 taggade recept behandlas som neutrala. Hela Fas 6C är bruten. Fix: `seasons: r.seasons \|\| []` i mappingen. | 01 |
| 2 | `api/replace-recipe.js:86–124` | **Historiken uppdateras aldrig vid receptbyte.** Nya receptet registreras inte i `recipe-history.json` → kan väljas igen direkt vid nästa generering. | 03 |
| 3 | `api/skip-day.js:21–32` | **Prisbesparings-badges hamnar på fel dag efter skip.** `saving`/`savingMatches` kopieras inte vid framåtflyttning av recept (men `unblock` gör rätt). | 03 |
| 4 | `js/weekly-plan/plan-viewer.js:941` | **Swap fungerar på bekräftad plan.** `showSwap` kontrollerar inte `window.planConfirmed` → swap-ikonen syns + backend saknar `confirmedAt`-check → muterar plan utan att inköpslistan uppdateras. | 04 |
| 5 | `js/weekly-plan/plan-viewer.js:469` | **TypeError på doh-recept utan ingredients/instructions.** `r.ingredients.map()` utan null-skydd → kraschar detaljpanelen. Fix: `(r.ingredients \|\| []).map(...)` | 04 |
| 6 | `api/_shared/shopping-builder.js:407–423` | **Vitlök hamnar i Skafferi.** Session 49-fixen (ordmängd-matchning) bröt `vitlöksklyftor` — saknas i `CATEGORY_KEYWORDS.Grönsaker`. | 01 |

### Säkerhet — innerHTML utan escaping (XSS)

Samtliga nedan infogar data via `innerHTML` utan escaping. Allvarligheten är **medel** — familjeapp utan inloggning, men angrepbar via komprometterad `GITHUB_PAT` eller skadligt Gemini-svar vid receptimport.

| Fil:rad | Data | Rapport |
|---------|------|---------|
| `plan-viewer.js:469,474,506` | `r.ingredients`, `r.instructions`, `r.title` | 04 |
| `plan-viewer.js:910` | `d.customNote` | 04 |
| `recipe-browser.js:103,112` | `r.title` i kort + data-attribut | 05 |
| `shopping-list.js:134–136` | `item` (manuella varor) | 06 |
| `utils.js:66` | `r.notes` | 07 |

**Fix-strategi:** `esc()`-funktionen finns redan i `plan-viewer.js:635`. Extrahera till `utils.js` och applicera på alla ställen ovan.

---

## P1 — Fixa snart

Potentiella buggar med realistiska edge cases.

| # | Fil:rad | Beskrivning | Rapport |
|---|---------|-------------|---------|
| 1 | `plan-viewer.js:352` | Swap:ens optimistiska uppdatering läser `textContent` som inkluderar badge-text → fel titel i bytta kort. | 04 |
| 2 | `plan-viewer.js:317–335` | Förflutna dagar i aktiv plan kan väljas som swap-mål → backend tillåter omskrivning av historisk data. | 04 |
| 3 | `shopping-list.js:137` | `removeManualItem` onclick escaping missar `"` → syntaxfel och bruten borttagning vid vara med citattecken. | 06 |
| 4 | `shopping-list.js:94–95` | Index-baserade checkbox-nycklar kan förskjutas vid re-render → fel varor markerade som avbockade. | 06 |
| 5 | `dispatch-to-willys.js:59` | `fetch(SHOPPING_LIST_URL)` saknar `res.ok`-kontroll → kryptiskt fel vid GitHub-nertid. | 02 |
| 6 | `secrets-store.js:55–79` | `writeUser` rensar inte gammal cache → dispatch sekunden efter cookie-refresh kan läsa stale credentials. | 02 |
| 7 | `recipes.js:44–56` / `import-recipe.js` | Nya/importerade recept får aldrig `seasons`-fältet → behandlas alltid som neutrala av säsongsalgoritmen. | 03 |
| 8 | `dispatch-preferences.js:12–24` | `prefsLoaded`-flaggan sätts även vid API-fel → felaktiga defaults permanentas tills sidladdning. | 06 |
| 9 | `dispatch-preferences.js:26–37` | `savePrefs` utan debounce → snabba ändringar kan skrivas i fel ordning. | 06 |
| 10 | `dispatch-ui.js:50–71` | `runDispatch` saknar timeout/AbortController → spinner utan escape vid långsam respons. | 06 |
| 11 | `css/styles.css:858+2948` | Duplicerad `@keyframes spin` → loading-icon snurrar 0.65s istället för 1.5s. | 07 |
| 12 | `plan-generator.js:73–79` | `tureDays + vegetarianDays` valideras inte mot `total_days` → möjligen omöjliga krav till backend. | 04 |
| 13 | `plan-viewer.js:1266–1272` | Fade-lyssnare binds till DOM-element som ersätts vid re-render → fade-animationer slutar fungera. | 04 |

---

## P2 — Förbättra

Dead code, inkonsistenser och förbättringsförslag.

### Dead code

| Fil:rad | Vad | Rapport |
|---------|-----|---------|
| `generate.js:175` | `turePool = pool.filter(hasTure)` — skapas men används aldrig | 01, 08 |
| `shopping-builder.js:169` | Duplicerad nyckel `"rödlökar"` | 01 |
| `css/styles.css:465–519` | `.plan-banner`-block (~55 rader) — gammalt banner-UI | 07 |
| `css/styles.css:1988–2016` | `.trigger-btn`-block (~30 rader) — gammalt generera-UI | 07 |
| `css/styles.css:252` | `.recipe-count { display: none }` | 07 |
| `css/styles.css:697` | `.icon-rotate-90` — oanvänd | 07 |
| `recipe-browser.js:287–288` | `initFilters` no-op stub — aldrig anropad | 05 |
| `recipe-editor.js:171–172` | `dataset.ingredients`/`dataset.instructions` — skrivs men läses aldrig | 05 |
| `willys-cart-client.js:56–64` | `verifyCart()` — aldrig anropad i dispatch-flödet | 02 |
| `utils.js:164–168` | `window.fmtIso`/`window.fmtShort` exponeras men anropas via ES6-import | 07 |

### Inkonsistenser

| Beskrivning | Rapport |
|-------------|---------|
| Tre olika User-Agent-strängar i willys-modulerna | 02 |
| `dispatch-to-willys.js` kringgår `handler.js`-wrappern utan kommentar | 02 |
| `skip` vs `unblock` — kopierar/kopierar inte `saving`-fälten | 03 |
| `buildTags()` i import lägger protein i `tags`-arrayen, manuellt tillagda gör det inte | 03 |
| `PROTEIN_LABEL` definieras lokalt i plan-viewer + identisk `proteinLabel` i utils.js | 04 |
| `timeBucket()` och `GROUP_DEFS.time.sections` — dubbel implementation av samma logik | 05 |
| `escapeHtml` dupliceras i `dispatch-preferences.js` och `dispatch-ui.js` | 06 |
| `@media (max-width: 600px)` vs `599px` — inkonsekvent brytpunkt | 07 |
| `window._allRecipes` deklareras inte i `state.js` trots att det är delad app-state | 07 |
| `CLAUDE.md` refererar till `window.activeFilters` som inte existerar | 05, 07 |

### Förbättringsförslag (urval)

| Beskrivning | Rapport |
|-------------|---------|
| `dispatch-matcher.js` — parallellisera sökanrop med `Promise.all` + concurrency-limit | 02 |
| Debounce sökfältets input-event (~120ms) — 5000 strängoperationer per tangent nu | 05 |
| Extrahera `esc()`/`escapeHtml()` till `utils.js` — dupliceras i 3 filer | 04, 06 |
| Flytta `selectRecipes`/`bucketBySaving` till `api/_shared/select-recipes.js` — eliminerar inline-kopia | 08 |
| Seedad slumpgenerator i tester — deterministiska, reproducerbara | 08 |

---

## P3 — Testtäckning

### Inline-kopia divergens (kritiskt)

`tests/select-recipes.test.js` innehåller en manuellt synkad kopia av `selectRecipes`/`bucketBySaving`. Tre divergenser hittade:

1. `turePool`-variabeln saknas i kopian (dead code i prod, men kopian är inte identisk)
2. Felmeddelande-text skiljer sig (`"Kunde inte hitta recept för..."` med/utan datum)
3. `constraints.ture_days || 0` (kopia) vs `constraints.ture_days` (prod) — godartad men visar bristande synk

**Rekommendation:** Extrahera till delad modul (`api/_shared/select-recipes.js`) och importera i både endpoint och test.

### Otestade högriskfunktioner

| Funktion | Risk | Rapport |
|----------|------|---------|
| `archiveOldPlan` (generate.js) | Tyst felhantering + komplex datumlogik — förstör historiken utan varning | 01, 08 |
| `applySeasonWeight` (generate.js) | Bruten i prod (se P0 #1) — inga tester hade fångat det | 01 |
| `filterRecipes` (generate.js) | Styr vilka recept som är valbara | 08 |
| `buildDayList` (generate.js) | DST-övergångar, skottår, veckonumrering | 08 |
| `categorize` direkt (shopping-builder.js) | Alla tester är indirekta via `buildShoppingList` | 01 |
| `normalizeOffers` (willys-offers.js) | Exporterad men helt otestad | 02 |
| `guessProtein` (import-recipe.js) | Ordningen av regex-tester styr resultat | 03 |
| `extractJsonLd` + `mapJsonLdToRecipe` (import-recipe.js) | JSON-LD-kantfall (@graph, HowToSection) | 03 |
| `passesFilters` (recipe-browser.js) | Filterkombi-logik (AND/OR) otestad | 05 |
| `buildPrompt` (dispatch-preferences.js) | Ren logik, lätt att isolera | 06 |

---

## Statistik

| Rapport | Kritiska | Potentiella | Dead code | Säkerhet | Inkonsistenser | Förbättringar | Testtäckning |
|---------|----------|-------------|-----------|----------|----------------|---------------|--------------|
| 01 Backend-kärna | 2 | 5 | 2 | 3 | 3 | 3 | 4 |
| 02 Willys-integration | 2 | 6 | 1 | 4 | 4 | 4 | 5 |
| 03 API-endpoints | 3 | 4 | 0 | 3 | 4 | 4 | 5 |
| 04 Frontend veckoplan | 3 | 6 | 3 | 3 | 5 | 5 | 5 |
| 05 Frontend recept | 2 | 5 | 3 | 3 | 4 | 5 | 5 |
| 06 Frontend inköpslista | 2 | 6 | 2 | 4 | 4 | 5 | 4 |
| 07 Frontend infra | 1 | 5 | 5 | 2 | 5 | 6 | 5 |
| 08 Testsvit | 4 | 4 | 2 | 2 | 3 | 4 | 7 |
| **Totalt** | **19** | **41** | **18** | **24** | **32** | **36** | **40** |

**210 fynd totalt** från 8 rapporter.
