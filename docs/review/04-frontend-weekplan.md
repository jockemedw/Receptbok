# Review: Frontend — veckoplansvyn

## Kritiska buggar

- **[plan-viewer.js:469]** — `r.ingredients.map(...)` och `r.instructions.map(...)` anropas utan null-skydd. Om ett importerat recept (doh-recept) saknar fältet `ingredients` eller `instructions` kastas `TypeError: Cannot read properties of undefined (reading 'map')`, vilket kraschar detaljpanelen för just det receptet. Fix: ersätt med `(r.ingredients || []).map(...)` och `(r.instructions || []).map(...)`, i linje med hur `renderDetailInner()` i `utils.js` (rad 61–62) redan hanterar samma fält.

- **[plan-viewer.js:941]** — `showSwap` kontrollerar `d.planId === 'active' && !d.blocked`, men inte `window.planConfirmed`. Swap-ikonen renderas alltså i tidslinjekorten även efter att planen bekräftats. `confirmPlan()` (rad 764) lägger klassen `confirmed` på befintliga ikoner, men vid nästa `renderWeeklyPlanData()` (t.ex. efter skip/block) renderas nya kort utan CSS-gaten. Ikonerna syns och är klickbara — `enterSwapMode()` startar swap-läge, och backend-endpunkten `/api/swap-days` saknar en `confirmedAt`-kontroll (till skillnad från `skip-day.js` rad 69 och `replace-recipe.js` rad 95). Swap på en bekräftad plan kan alltså muttera `weekly-plan.json` utan att inköpslistan uppdateras. Fix: lägg till `&& !window.planConfirmed` i `showSwap`-villkoret.

- **[plan-viewer.js:352]** — I `swapDays()` läses titeln för optimistisk uppdatering med `card1.querySelector('.week-day-recipe').textContent`. Om kortet innehåller en sparande-badge eller pending-badge ingår även deras text i `textContent`, vilket gör att felaktig text skrivs in i det bytta kortet. Fix: läs titeln från `window._timelineByDate[date1]?.recipe` istället för DOM-text.

## Potentiella buggar

- **[plan-viewer.js:85]** — `isCustom` sätts till `!!custom && !entry.recipeId && !entry.isArchive`. Om ett datum tillhör arkivet OCH har en custom-entry ignoreras custom-posten tyst, utan att användaren informeras. Beteendet kan vara avsiktligt, men kombinationen är ospecad och kan leda till att en manuell anteckning döljs utan varning.

- **[plan-viewer.js:556]** — `modifyDay()` kallar `renderWeeklyPlanData(data.weeklyPlan, shop)` utan att skicka med `window._planArchive` och `window._customDays`. Signaturen har `archive = null` och `customDays = null` som default, varpå renderingen faller tillbaka på `window._planArchive || { plans: [] }`. Det fungerar i normalfallet, men om `renderWeeklyPlanData` precis har skrivit dessa till `window.*` för första gången i sessionen och sedan kastas ett renderingsfel kan `window._planArchive` fortfarande vara `undefined`, vilket ger `{ plans: [] }` och ett tomt arkiv. Klarare att skriva `renderWeeklyPlanData(data.weeklyPlan, shop, false, window._planArchive, window._customDays)` explicit, i linje med hur `discardPlan()` (rad 739) gör det.

- **[plan-viewer.js:317–335]** — `enterSwapMode()` markerar alla kort med `swap-target` som har `data-recipeid`, saknar `data-readonly="1"` och saknar klassen `blocked`. Arkivkort sätts till `data-readonly="1"` (rad 967), så de exkluderas korrekt — men active-plan-kort med recept och `data-past="1"` exkluderas inte. Förflutna dagar kan alltså väljas som swap-mål trots att de är passerade. Backend tillåter bytet (ingen datumvalidering i `swap-days.js`), vilket resulterar i att data i det förflutna skrivs om i `weekly-plan.json`. Fix: lägg till `&& c.dataset.past !== '1'` i filtret i `enterSwapMode()`.

- **[plan-generator.js:73–79]** — `updateSettingsPreview()` klipper `vegetarianDays` och `tureDays` till max `diff` var för sig, men validerar inte att `tureDays + vegetarianDays <= diff`. Backend (`api/generate.js`) hanterar överlapp i sin algoritm, men användaren ser inget varningsmeddelande i UI om kombinationen är orimlig. Edge-case: `diff = 3`, `vegetarianDays = 3`, `tureDays = 2` → inget UI-fel, men algortimen tvingas köra med omöjliga krav.

- **[plan-viewer.js:366–367]** — `applySwap()` sätter `onclick`-attributet via `setAttribute` med en naiv `replace(/'/g, "\\'")`. Recept-titlar med bakslash följt av ett enkelt citattecken (`\'`) i sin titel kan fortfarande ge ett syntaxfel i inline JavaScript. Risken är liten eftersom titlar importeras kontrollerat, men ett importerat recept med titel som `Mario's Pasta` + ett bakslash-tecken skulle kunna orsaka ett runtime-fel vid nästa klick.

- **[ingredient-preview.js:15]** — `Object.values(recipeItems).every(v => v.length === 0)` kastar `TypeError` om ett kategorivärde är `null` eller inte en array. Om `shopping-list.json` innehåller en kategori med `null` (t.ex. vid felaktig data) kraschar hel-ingredienssektionen. Fix: `every(v => !Array.isArray(v) || v.length === 0)`.

- **[plan-generator.js:95–99]** — `updateDateHint()` anropar `renderDayToggles([])` och returnerar tidigt om `diff < 1`. `diff` beräknas av `daysBetween(startVal, endVal)` som returnerar `Math.round(...) + 1`. Om `startVal === endVal` blir `diff = 1`, inte `0`, så villkoret `diff < 1` träffas aldrig för samma datum — men texten "1 dag planeras" visas korrekt. Dock ger `diff = 0` vid `endDate` = dagen innan `startDate` ett negativt värde, och `daysBetween` returnerar 0 via `Math.round(-0.5 * ...) + 1 = 0`. Villkoret `diff < 1` fångar `0` men inte negativa värden om differensen är stor nog att `Math.round` rundar till `-1` eller lägre. Faktisk risk: liten, men felmeddelandet "Slutdatum måste vara efter startdatum" visas inte för alla ogiltiga kombinationer.

## Dead code

- **[plan-viewer.js:478]** — `const PROTEIN_LABEL = {...}` definieras lokalt inne i `openWeekRecipe()` vid varje anrop. Konstanten `proteinLabel` med identiskt innehåll exporteras redan från `utils.js` (rad 3–6) och används i `recipe-browser.js`. Lokala definitionen borde tas bort och ersättas med import/`window.proteinLabel`.

- **[plan-viewer.js:1266–1272]** — `_fadeListenerAttached`-flaggan förhindrar att scroll-lyssnaren binds mer än en gång. Logiken är korrekt, men om `#timelineOuter .timeline-wrap`-elementet återkastas i DOM (vilket `renderWeeklyPlanData` gör varje gång via `weekGrid.innerHTML = ...`) pekar lyssnaren fortfarande på det gamla elementet som inte längre är i dokumentträdet. Lyssnaren är tekniskt "aktiv" på ett detached element — `updateTimelineFades` anropas aldrig igen. Effekten är att fade-klasser slutar uppdateras efter att `renderWeeklyPlanData` körts en gång (inklusive vid kassering/re-generering). Fix: ta bort `_fadeListenerAttached`-gaten och bind lyssnaren på nytt vid varje `renderWeeklyPlanData`, alternativt använd event-delegation på `#timelineOuter` som inte återrenderas.

- **[plan-viewer.js:130–134 / plan-viewer.js:132]** — `centerTodayCard(opts)` är ett tunt wrapper-anrop till `centerOnDate(null, opts)` och används bara på rad 1280 (`window.centerTodayCard = centerTodayCard`). Samtliga interna anrop kallar `centerOnDate(null, ...)` direkt. Wrappern kan tas bort och `window.centerTodayCard` kan peka direkt på `centerOnDate.bind(null, null)`.

## Säkerhet

- **[plan-viewer.js:469, 474, 506]** — `r.ingredients`, `r.instructions` och `r.title` infogas i `innerHTML` utan escaping. Receptdata läses från `recipes.json` via `window.RECIPES` (satt av `app.js`), som laddas från GitHub-repot. En angripare som kan skriva till `recipes.json` (med `GITHUB_PAT`) kan injicera HTML/JS i ingredienser, instruktioner eller titlar som exekveras i alla användares webbläsare nästa gång receptet öppnas i veckovyn. Allvarlighetsgrad: **hög** för den som har tillgång till `GITHUB_PAT` (dvs. Vercel-backend), **låg** externt. Partiell fix: använd `esc()`-funktionen som redan finns i filen (rad 635) för `r.title` och `r.notes`, och `textContent`-tilldelning (eller `esc()` per ingrediensrad) för `ingHtml`/`stepsHtml`.

  Notera: `openSavingPopover()` (rad 651–672) skyddar konsekvent all serverdata via `esc()`. Inkonsekvensen gäller alltså bara recept-detaljvyn.

- **[plan-viewer.js:904, 910]** — `d.customNote` infogas direkt i `innerHTML` (rad 910: `${d.customNote ? d.customNote : '✏️ Egen'}`). `customNote` kommer från `custom-days.json` som kan innehålla vad som helst en inloggad familjemedlem har skrivit. Allvarlighetsgrad: **låg** (familjeapp, inga externa användare, ingen autentisering = vem som helst kan skriva vad som helst). Fix: wrap med `esc(d.customNote)`.

- **[plan-viewer.js:892, 934]** — `safeTitle.replace(/'/g, "\\'")` och liknande mönster används för att säkra titlar som sätts i inline `onclick`-attribut. Enkelt citattecken hanteras, men dubbelt citattecken i titeln (t.ex. `"Thai"-soppa`) och HTML-tecken som `<` eller `&` hanteras inte. Om en recepttitel innehåller `"` kan onclick-attributet brytas syntaktiskt. Allvarlighetsgrad: **låg** (titlar kontrolleras vid import), men en fullständig `esc()`-sanering vore mer robust.

## Inkonsistenser

- **[plan-viewer.js:478 vs utils.js:3]** — `PROTEIN_LABEL` definieras lokalt i `openWeekRecipe()` men en identisk `proteinLabel`-konstant exporteras från `utils.js`. Samma namngivning fast med olika casing i samma kodbas.

- **[plan-viewer.js:486–490]** — Swap-knappen (`swapBtn`) visas för arkivkort om `!readOnly`, men `replaceBtns` döljs om `readOnly || planConfirmed`. Dessa två villkor är alltså inte kongruenta: arkivkort har `readOnly = true` (via `data-readonly="1"`), vilket korrekt döljer `replaceBtns` och `skipBlockBtns`. Men `swapBtn` döljs av `!readOnly` — vilket också är korrekt. Logiken stämmer, men villkoren borde vara en enda gemensam variabel (`canEdit = !readOnly && !isPast && !window.planConfirmed`) för att undvika att framtida ändringar glömmer ett av fallen.

- **[plan-viewer.js:883–884 vs 1065–1069]** — HTML-strängar byggs med en blandning av `onclick=` i dubbelt citattecken (inline på kortet) och `onclick=` i enkelt citattecken (bulk-bannern med `JSON.stringify`). Skillnaden är medveten men inte kommenterad.

- **[plan-generator.js:12–13 vs plan-viewer.js:291]** — Datum-konstruktioner som `new Date(str + 'T12:00:00')` (utan `Z`) förekommer i båda filerna och i `utils.js`. Tidszonskorrigeringen sker konsekvent via noon-tid, men `fmtIso()` i `utils.js` använder `Date.toISOString()` (UTC) som kan ge fel datum om lokal tid är UTC-12 eller UTC+13. Risken är försumbar för Sverige (UTC+1/+2), men mönstret borde kommenteras.

- **[plan-viewer.js:1256–1273 vs resten av filen]** — `updateTimelineFades()` och `initTimelineFadeListener()` är definierade efter window-exponeringarna (rad 1245–1255) och återupptas efter `window.closeSavingPopover` på rad 1275. Ordningen är ologisk — fade-funktionerna borde antingen ligga med renderingslogiken (~rad 990) eller efter window-blocken.

## Förbättringsförslag

- **[plan-viewer.js:1185–1241]** — `saveCustomDay()`, `saveCustomDaysBulk()` och `clearCustomDay()` har identiska success-block: `panel.classList.remove('open')`, `panel.innerHTML = ''`, `renderWeeklyPlanData(...)`. Dessa tre block kan extraheras till en privat hjälpfunktion `closeAndRerenderPlan()` för att minska dupliceringen och säkerställa att alla tre alltid beter sig likadant.

- **[plan-viewer.js:535–573]** — `modifyDay()` fryser alla kort (`pointerEvents = 'none'`) under API-anropet, men lyfter inte pekarna i `finally` om kortet redan tagits bort från DOM (vid re-rendering). Eftersom `renderWeeklyPlanData` byter ut hela `weekGrid.innerHTML`, pekar `cards`-variabeln på gamla DOM-element som inte längre är i dokumentet. I normalfallet spelar det ingen roll (garbage-collectat), men explicit `cards.forEach(c => c.style.pointerEvents = '')` på detached element är onödigt. Flytta frysningslogiken till en loading-overlay istället.

- **[plan-viewer.js:504–522]** — Detaljpanelen i `openWeekRecipe()` bygger ett strängt dubbel-passage av recept-HTML (ingredienser + steg) som redan byggs identiskt av `renderDetailInner()` i `utils.js`. Orsaken är att `plan-viewer.js` lägger till extra knappar (replace, swap, skip, block) runt samma innehåll. Refaktorering: skapa en `renderPlanDetailInner(r, actionBtns)` som kombinerar `renderDetailInner(r)` + `actionBtns`, istället för att duplicera ingrediens- och steg-renderingen.

- **[ingredient-preview.js:56]** — `alert('Kunde inte flytta varorna — prova igen.')` bryter mot projektets designprincip om svenska felmeddelanden utan native `alert`-dialoger (mobil Safari visar en generisk dialogruta). Byt ut mot ett inline-felmeddelande i knappens near-DOM, i linje med hur övriga fel hanteras i `plan-viewer.js`.

- **[plan-generator.js:63–67]** — `btn.textContent = label + ' (${count})'` i `updateSettingsPreview()` sparar protein-antalet i knapptexten. Om `updateSettingsPreview()` anropas upprepade gånger (t.ex. vid snabb inmatning i datumfält) kan mönstret `.replace(/\s*\(\d+\)/, '')` som strippar det gamla antalet köras om och om. Lagra istället räknaren i ett separat `data-count`-attribut och läs rubriken från en konstant.

## Testtäckning

- **[plan-viewer.js:enterSwapMode]** — Logiken för vilka kort som markeras som swap-target (filter: `data-recipeid`, `data-readonly !== '1'`, inte `.blocked`) saknar tester. Bör testas för: arkivkort (ska inte vara target), förflutna dagar (bör inte vara target, men är det idag — se Potentiella buggar), bekräftad plan.

- **[plan-viewer.js:buildTimeline]** — Tidslinjens horisont-beräkning (dynamisk `back`/`forward` med cap 45 dagar) är rent logisk JS utan DOM-beroende och borde testas: custom-dag utanför plan sträcker horisonten, arkiv med gammal startDate sträcker bakåt, flera överlappande villkor kombinerade.

- **[plan-viewer.js:openWeekRecipe]** — Konditionalet `data-readonly` / `data-past` / `window.planConfirmed` styr vilka knappar som renderas i detaljpanelen. Dessa kombinationer (8 st) testas inte alls och är svåra att verifiera manuellt.

- **[plan-generator.js:updateSettingsPreview]** — Clippa-logiken (`vegDays > diff → klimp`) och varningen vid `matching.length < 3` saknar tester. Bör inkluderas i befintliga `tests/select-recipes.test.js` eller i ett nytt `tests/plan-generator.test.js`.

- **[plan-viewer.js:swapDays — optimistisk rollback]** — Rollback-logiken i `applySwap` (rad 384) anropas med inverterade argument vid API-fel. Att rollback faktiskt återställer rätt titlar och `onclick`-attribut testas inte.
