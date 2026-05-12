# Review: Frontend infrastruktur (app, CSS, HTML)

## Kritiska buggar

- **[css/styles.css:858 och 2948]** — `@keyframes spin` definieras två gånger med samma namn. Den första (rad 858) driver `loading-icon` med `1.5s linear`. Den andra (rad 2948) driver `.import-spinner` med `0.65s linear`. I CSS vinner den **senare** definitionen, vilket betyder att `.loading-icon` körs på 0.65s (snabbare än avsett) på alla webbläsare. Fix: döp om den ena animationen, t.ex. `@keyframes spinFast` för `.import-spinner`.

- **[index.html:284]** — Inline `onkeydown` för "Lägg till vara"-fältet i `#shopContent` anropar `addManualItem()` utan argument. Funktionen `addManualItem()` i `shopping-list.js:202` har default-parametrar `inputId = 'manualItemInput'` och `btnId = 'manualAddBtn'`, vilket stämmer med ID:na på rad 282–285. Det fungerar korrekt. Däremot: om `#shopContent` någonsin renderas om med andra ID-värden (som `Empty`-varianten gör på rad 263–265) utan att ändra `onclick`-strängen uppstår en tyst miss. Mer ett potentiellt framtida fel än en kriti­sk bugg idag, men värt att notera i kontexten av duplicerad HTML-struktur (se Inkonsistenser).

## Potentiella buggar

- **[js/app.js:175–176]** — `init()` och `window.loadWeeklyPlan()` anropas sekventiellt i top-level utan att vänta på varandra. `init()` är async och returnerar ett Promise som ignoreras. Om `recipes.json`-fetch är långsam kör `loadWeeklyPlan()` redan medan `window.RECIPES` fortfarande är `[]`. I praktiken beror inget i `loadWeeklyPlan()` på `RECIPES` vid laddningstillfället, men om det i framtiden läggs till en funktion som testar `window.RECIPES` direkt vid veckoplans-rendering kan det ge en edge-case med tom array. Enkel fix: kalla `window.loadWeeklyPlan()` inuti `init()` efter att RECIPES satts.

- **[js/app.js:27–28]** — `buildTagFilterUI()` anropas inne i `init()` (rad 27) och refererar till `window.RECIPES` som precis satts på rad 22. `renderRecipeBrowser()` anropas direkt efter (rad 28). Båda körs synkront efter att RECIPES-arrayen är klar — det är korrekt. Edge case: om `buildTagFilterUI()` kastar ett undantag (t.ex. om `tagFilterChecks`-elementet saknas av någon anledning) avbryts `init()` mitt i körningen och `renderRecipeBrowser()` aldrig anropas. `loadingState` försvinner aldrig. Ingen try/catch täcker rad 27–29 specifikt — felet skulle hamna i den yttre catch på rad 30, men felmeddelandet `err.message` skulle vara kryptiskt.

- **[js/ui/scroll.js:3–4]** — `headerEl` och `scrollBtn` hämtas med `document.querySelector/getElementById` på modulens top-level, utanför `DOMContentLoaded`. Eftersom `app.js` laddas som `type="module"` väntar webbläsaren på DOM-parsning innan modulkoden körs, så elementerna finns. Men om `scroll.js` någonsin importeras utanför en `type="module"`-kontext, eller om `<header>` eller `#scrolltop` byter plats i HTML-strukturen, kraschar hela modulen vid importtid med `Cannot read properties of null`. Ingen defensiv null-check.

- **[css/styles.css:2975 och 2977]** — `.fab-import` får `display: none` i sin regelblock (rad 2975) och omedelbart därefter `display: block` i en separat regel (rad 2977). Den andra regeln vinner alltid — `display: none` i den ursprungliga deklarationen är alltså aldrig effektiv. Den korrekta `tab-recept-only`-klassen (som döljer knappen på andra flikar) hanteras via `navigation.js` med `style.display`, inte CSS-klassen, så logiken fungerar ändå — men regeln `display: none` i regelblocket är vilseledande och borde tas bort.

- **[js/app.js:83–86]** — Delegerad klickhanterare för `[data-sheet-close]` lyssnar på hela `document.body`. Om en knapp med `data-sheet-close` råkar hamna inuti ett modal-fönster som är öppet **samtidigt** som ett sheet är öppet, stänger båda. Appen verkar inte öppna sheets och modaler simultant, men det finns inget explicit skydd mot det.

- **[css/styles.css:534]** — `.recipe-section-header` har `top: env(safe-area-inset-top, 0)`. På enheter utan notch är `safe-area-inset-top` noll, och headern gömmer sig bakom den sticky `<header>` (som är ~100px hög). Headern hanterar sin höjd via `ResizeObserver → body.paddingTop`, men `recipe-section-header` tar inte hänsyn till `body.paddingTop`. I praktiken fungerar det eftersom `.recipe-section-header` använder `.stuck`-klassen med `IntersectionObserver` och `rootMargin` baserad på safe-area-höjden. Men beroende på timing av IntersectionObserver kontra header-resize kan rubriken tillfälligt sticka under den fasta headern på enheter med notch. Edge case, men rapporterades som bugg i Session 47.

## Dead code

- **[css/styles.css:465–519]** — CSS-klasser `.plan-banner`, `.plan-banner.visible`, `.plan-banner-title`, `.plan-days`, `.plan-day`, `.plan-day:hover`, `.plan-day-name`, `.plan-day-recipe` existerar i CSS men har ingen matchning i vare sig HTML eller JS (sökning på `plan-banner`, `plan-days`, `plan-day` gav noll träffar). Dessa är sannolikt rester från ett äldre banner-UI som ersattes av tidslinjen. Kan tas bort.

- **[css/styles.css:1988–2016]** — CSS-klasser `.trigger-btn`, `.trigger-btn:hover`, `.trigger-hint`, `.trigger-dates`, `.trigger-dates.visible` har inga matchningar i HTML eller JS-filer. Dessa är rester från det gamla generera-knapp-UI:t som ersattes av nuvarande `.generate-btn`. Kan tas bort.

- **[css/styles.css:252]** — `.recipe-count { display: none; }` har inga matchningar i HTML eller JS. Kan tas bort.

- **[js/utils.js:164–168]** — `window.fmtIso`, `window.fmtShort`, `window.renderIngredient`, `window.timeStr` och `window.getHolidayName` registreras på `window`, men ingen av dem anropas via `window.`-prefixet i resten av kodbasen. Alla anropas via ES6-import direkt. Undantaget är `toggleStep` och `openEditModal` som anropas via `onclick="..."` i inlinead HTML och faktiskt behöver vara globala. `renderIngredient` anropas enbart av `renderDetailInner` i samma fil. `window.fmtIso` och `window.fmtShort` är onödiga exponeringar men ofarliga.

- **[css/styles.css:697–698]** — `.icon-rotate-90` definieras men sökning i JS och HTML ger inga träffar. Troligen oanvänd hjälpklass.

- **[js/state.js — `window.activeFilters`]** — Kommentaren i CLAUDE.md nämner att `window.activeFilters` bevaras för bakåtkompat med `recipe-editor.js`, men grep ger noll träffar på `activeFilters` i hela JS-kodbasen. Variabeln deklareras inte ens i `state.js` — det är alltså en kommentar som refererar till något som inte längre existerar. Kommentaren i `recipe-browser.js` bör tas bort.

## Säkerhet

- **[js/utils.js:66]** — `r.notes` interpoleras direkt i innerHTML-sträng: `` `<div class="notes-box">💡 ${r.notes}</div>` ``. Recept-data hämtas från `recipes.json` via GitHub-repot, inte från slumpmässiga användare, och allt sätts via `innerHTML` i ett kontrollerat DOM-träd. Appen har ingen inloggning eller extern användarbas. Risk: **låg** i nuläget, men om receptimport via URL eller foto i framtiden leder till att `notes`-fältet innehåller `<script>`-taggar kan XSS uppstå. Samma mönster finns i `plan-viewer.js:474` för `r.notes` och i `recipe-browser.js:103` för `r.title`. Rekommendation: escapa åtminstone `r.notes` och `r.title` med en enkel funktion `escHtml(s)` som ersätter `<`, `>`, `"`, `&`.

- **[index.html:5]** — `user-scalable=no` i viewport-metataggen blockerar inzooming för användare med nedsatt syn. Inget direkt säkerhetsproblem, men en tillgänglighetsrisk. Projektet är en intern familjeapp, så konsekvensen är begränsad. Allvarlighetsgrad: **låg**.

## Inkonsistenser

- **[css/styles.css:3061 vs resten av filen]** — Dispatch-mediefrågan `@media (max-width: 600px)` bryter mönstret. Resten av filen använder konsekvent `@media (max-width: 599px)` och `@media (min-width: 600px)` som brytpunkt. 600px är en pixel bredare och innebär att en exakt 600px bred skärm (vanlig Chrome-devtools-bredd) får dispatch-knappen i column-layout men header-tabs i desktop-läge. Liten skillnad, men bör synkroniseras till `599px`.

- **[css/styles.css:2975–2977]** — `.fab-import` deklareras med `display: none` inuti regelblocket och sedan `display: block` i en direkt efterföljande tom regel. Se Potentiella buggar ovan. Inkonsistensen är att `display`-värdet skrivs två gånger på radnivå istället för att ha en tydlig slutgiltig regel.

- **[index.html:23–25 vs 326–354]** — Header-nav-flikarna (`.header-tab`) och bottom-nav-knapparna (`bottom-nav-tab`) duplicerar tab-logiken med `onclick="switchTab(...)"` och `data-tab`-attribut. Båda sätts som `active` separat i `switchTab()` via `querySelectorAll('[data-tab]')` vilket fungerar korrekt — men det är två parallella representationer av samma navigationslogik. Om ett tab-värde läggs till måste det ändras på tre ställen: header-nav, bottom-nav och `switchTab`-funktionen.

- **[js/state.js]** — `window._allRecipes` deklareras inte i `state.js`, trots att det används som delad app-state (sätts i `app.js:23` och `recipe-editor.js:111`, läses i `plan-generator.js:43`). Alla andra delade variabler definieras i `state.js`. Inkonsekvent.

- **[css/styles.css — `--color-success-dark`]** — Tokenet `--color-success-dark` definieras på rad 32 som alias för `--lichen-deep`, men används sedan med fallback-värde på raderna 1438, 1520 och 1535: `var(--color-success-dark, var(--lichen-deep))`. Fallback är onödig när tokenet alltid är definierat i `:root`. Antingen tas `--color-success-dark` bort och ersätts med `--lichen-deep` direkt, eller tas fallbacks bort.

- **[index.html:23 vs navigation.js]** — Header-flikarna har `id="tabRecept"`, `id="tabVecka"`, `id="tabShop"` men dessa ID:n används aldrig i JavaScript (sökning ger noll träffar). Onödiga ID:n som skapar falsk förväntan om programmatisk användning.

## Förbättringsförslag

- **[js/utils.js:164–168]** — `window.fmtIso` och `window.fmtShort` exponeras globalt men anropas enbart via ES6-import. Ta bort `window.fmtIso`- och `window.fmtShort`-raderna för att hålla det globala `window`-namnrymden ren. Noll funktionsändring.

- **[js/app.js:42–78]** — `openSheetCount`-räknaren är försvarskod mot att öppna flera sheets simultant, men appen öppnar aldrig två sheets på samma gång. Logiken är korrekt men `openSheetCount > 1` inträffar aldrig i praktiken. Koden kan förenklas till en boolean `isSheetOpen`.

- **[css/styles.css:857–858 och 2948–2950]** — Döp om `@keyframes spin` till `@keyframes spinSlow` (för loading-icon, 1.5s) och `@keyframes spinFast` (för import-spinner, 0.65s) för att eliminera konflikten och göra avsikten tydlig.

- **[js/app.js:176]** — Flytta `window.loadWeeklyPlan()` inuti `init()`-funktionen efter rad 28 (`window.renderRecipeBrowser()`). Ger renare init-flöde och undviker den teoretiska race-condition där `loadWeeklyPlan` körs medan RECIPES ännu är tom.

- **[index.html:13–15]** — `<style>/* tömd — CSS flyttad till css/styles.css */</style>` är ett tomt style-block. Det är ofarligt men kan tas bort för att hålla HTML-filen ren.

- **[css/styles.css:465–519, 1988–2016, 252, 697]** — Ta bort de fyra dead-code-blocken (se ovan). Sparar ~80 rader CSS och minskar underhållsbördan.

## Testtäckning

- **[js/app.js:buildTagFilterUI]** — Funktionen bygger dynamisk checkbox-HTML och kopplar eventlisteners. Den har inga tester. Borde testas med: (1) tom tag-array — säkerställ att `tagFilterGroup` förblir dold, (2) tags som matchar `EXCLUDED_TAGS` — säkerställ att de filtreras bort, (3) korrekta räknare per tagg.

- **[js/app.js:openSheet/closeSheet]** — Scroll-lock-logiken (spara `scrollY`, fixa body, återställ) är kritisk för iOS-beteende och har inga tester. Borde testas med: (1) stäng sheet återställer `scrollY` korrekt, (2) `openSheetCount` går aldrig under 0.

- **[js/ui/scroll.js:smoothScrollTo]** — Easing-animationen har inga enhetstester. Borde testas: (1) att `isSnapping` sätts till false när animationen är klar, (2) att `lastScrollY` uppdateras korrekt vid slutpositionen.

- **[js/utils.js:isoWeekNumber]** — Gauss-beräkningarna för påsk och veckonummer har implicit testtäckning via select-recipes-testerna, men `isoWeekNumber` testas aldrig direkt. Kantfall att testa: vecka 1 i januari, vecka 53, övergång nyår.

- **[js/utils.js:getSwedishHolidays]** — Helgdagsberäkning testas inte. Påsk varierar per år — testa åtminstone kända år (2024, 2025, 2026) mot kända datum.
