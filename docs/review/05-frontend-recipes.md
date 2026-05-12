# Review: Frontend — recepthantering

## Kritiska buggar

- **recipe-editor.js:112** — Vid spara nytt recept byggs `recipeGrid.innerHTML` med `window.RECIPES.map(window.renderCard).join('')` direkt, utan att kalla `renderRecipeBrowser()`. Det innebär att grupperingar, aktiva filter och sökterm ignoreras — den nyskapade recetplistan visas utan grupprubriker (platt lista). Strax efter (rad 134) kallas `renderRecipeBrowser()` för att rätta till detta, men ett visuellt blixtsnabbt "platt läge" syns i ~0 ms. Primär risk: om `renderRecipeBrowser()` på rad 134 kastar ett fel (t.ex. att `search`-elementet saknas) stannar appen i det platta tillståndet. **Fix:** Ta bort rad 112 och 120–121 (de platta `innerHTML`-tilldelningarna inuti try/catch och fallback); låt `renderRecipeBrowser()` på rad 134 göra allt renderingsarbete.

- **recipe-editor.js:171** — Vid uppdatering av befintligt recept skrivs `card.dataset.ingredients` och `card.dataset.instructions` (rad 171–172), men dessa data-attribut existerar inte i det HTML som `renderCard()` genererar (recipe-browser.js:92–118). `matchesSearch()` i recipe-browser.js söker mot `window.RECIPES`-arrayen, inte DOM-attribut, så sökningen är korrekt — men de skrivna attributen skapar oreda utan att användas, och om koden en dag ändras till att läsa från DOM uppstår en svår bugg.

---

## Potentiella buggar

- **recipe-browser.js:183** — `window.RECIPES.filter(...)` kraschar med `TypeError: Cannot read properties of undefined (reading 'filter')` om `renderRecipeBrowser()` anropas innan `init()` i app.js har slutfört sitt `fetch('recipes.json')`. I nuläget anropas `renderRecipeBrowser()` på rad 28 i app.js inuti `init()` efter att `window.RECIPES` är satt, men om en annan modul kallar `window.renderRecipeBrowser()` tidigt (t.ex. från ett event-lyssnar-race) failar det tyst. `window.RECIPES` initieras till `[]` i state.js, så filtret returnerar tom array — crash uteblir, men resultat är tomt utan felmeddelande. Risken är låg men oväntat tyst vid fel.

- **recipe-browser.js:84** — I `cuisine`-grupperingen är den sista sektionen `{ id: 'ovrig', match: r => !CUISINE_TAGS.some(t => r.tags.includes(t)) }`. Den matchar också recept med `doh`-taggen som saknar kök-tagg, trots att det finns en dedikerad `doh`-sektion på rad 83. `buckets.find(b => b.match(r))` returnerar första träff — men `doh`-sektionen (rad 83) evalueras *före* `ovrig`-sektionen, så ett doh-recept *utan* kök-tagg hamnar i "Dishing out health" korrekt. Däremot hamnar ett doh-recept *med* en kök-tagg (t.ex. `'italienskt'`) i kök-sektionen och aldrig i doh-sektionen. Detta stämmer med Session 46-kommentaren "doh + cuisine → hamnar i cuisine-sektionen (first-match-wins)", men det är inte dokumenterat i koden och kan vara oväntat.

- **recipe-import.js:50–72 (importFromUrl) och 75–108 (importFromPhoto)** — Dubbeltryck på knappen förhindras via `btn.disabled = true` på rad 55 resp. 79. Men om användaren snabbt öppnar importmodalen, trycker på knappen, stänger modalen (via `closeImportModal`) och öppnar den igen innan fetch:en är klar, har `openImportModal()` redan återställt `importUrlBtn.disabled = false` (rad 10). Den pågående fetch:en håller fortfarande en referens till den gamla `btn`-variabeln och sätter `btn.disabled = false` igen i sin catch-gren — men den *nya* knappen i DOM kan nu tryckas igen och starta en ny import parallellt. Resultatet: två `openImportPreview`-anrop kan öppna redigeringsmodalen i snabb följd. Sannolikt sällsynt men möjligt.

- **recipe-browser.js:253–258 (jumpToRecipe)** — `card.dataset.title` jämförs med `title.toLowerCase()`. Titeln i `data-title` sätts på rad 96 som `r.title.toLowerCase()` vid renderingstillfället. Om `title`-argumentet innehåller specialtecken som uppför sig olika i `.toLowerCase()` beroende på locale kan matchningen missa. Liten risk, men `localeCompare` används konsekvent annars i koden.

- **recipe-editor.js:190** — `window.confirm()` i `deleteRecipe()` blockerar huvudtråden och fungerar inte i alla inbäddade webbläsare (t.ex. iOS WKWebView-konfigurationer och vissa Progressive Web App-lägen). Dialogen returnerar alltid `false` i dessa miljöer, vilket gör det omöjligt att ta bort recept. Projektet riktar sig mot mobilwebbläsare och planerar Capacitor-app (Fas 5A).

- **app.js:66–76 (closeSheet)** — `openSheetCount` decrementeras och om det når 0 återställs scroll-lock. Om `openSheet` och `closeSheet` anropas i fel ordning (t.ex. direkt stängning utan föregående öppning) kan `openSheetCount` bli negativt och `window.scrollTo(0, 0)` hoppa sidan till toppen. `Math.max(0, openSheetCount - 1)` på rad 66 skyddar mot detta, men body-stilarna återställs ändå om `openSheetCount` var 0 och en `closeSheet`-anrop sker — vilket innebär att en korrekt låst scroll kan låsas upp av misstag.

---

## Dead code

- **recipe-browser.js:287–288 och 297** — `initFilters`-funktionen är en no-op (tom kropp med kommentar) som exponeras på `window`. Inget annat i kodbasen anropar `window.initFilters()` (verifierat med grep). Den sattes dit som "bakåtkompatibel stub" vid Session 46-refaktorn men används inte. Kan tas bort.

- **recipe-browser.js:10–11 (TYPE_TAGS, CUISINE_TAGS)** — Dessa konstanter används i `GROUP_DEFS` (rad 68, 79) och är alltså i bruk. Inte dead code — noterades vid genomläsning men bekräftades vara korrekt använda.

- **recipe-editor.js:171–172** — `card.dataset.ingredients` och `card.dataset.instructions` sätts vid uppdatering av recept, men dessa attribut finns inte i `renderCard()`-outputen och läses inte någonstans i koden. Dessa rader skriver till odefinierade dataset-attribut som aldrig konsumeras.

- **state.js (window.activeFilters saknas helt)** — CLAUDE.md Session 46 nämner att `window.activeFilters` bevarades "oanvänd för bakåtkompat med recipe-editor.js". Grep-sökning i hela `js/`-katalogen visar att `activeFilters` inte förekommer i någon JS-fil alls — inte i recipe-editor.js, inte i recipe-browser.js, inte i state.js. Variabeln initieras alltså inte och existerar inte. Kommentaren i CLAUDE.md är inaktuell — inget att städa i kod, men dokumentationen stämmer inte.

---

## Säkerhet

- **recipe-browser.js:112 (renderCard)** — `r.title` interpoleras direkt i HTML-attributet `data-title="${r.title.toLowerCase()}"` och som synlig text `${r.title}` (rad 103). Om en recepttitel innehåller `"` bryts attributet och om HTML-taggar finns i titeln renderas de i `.card-title`. Exempelvis skulle titeln `"><img src=x onerror=alert(1)>` köra godtyckligt JS. Roten är `openImportPreview` i recipe-import.js (rad 140) som sätter `edit-title.value` utan sanitering — värdet kommer direkt från Gemini API-svaret. Allvarlighetsgrad: **medel**. Appen är en intern familjeapp utan publik inloggning, men Gemini-import kan teoretiskt skicka tillbaka skadlig HTML i recepttiteln om API:t komprometteras eller svarar oväntat. **Fix:** Escapa `r.title` med `textContent` istället för `innerHTML` för titel-elementet, eller använd en `escapeHtml()`-hjälpare vid interpolation i attribut.

- **recipe-import.js:65 (importFromUrl)** — `data.error`-meddelandet från backenden skrivs direkt till `fb.textContent` (rad 70: `fb.textContent = e.message || ...`). Eftersom det är `textContent` (inte `innerHTML`) är XSS inte möjligt. Allvarlighetsgrad: **låg**.

- **recipe-editor.js:178** — Vid in-place-uppdatering av kortet sätts `card.querySelector('.card-meta').innerHTML` med interpolerat `updated.title` (via `toggleTested`-onclick-attributet på rad 178). Om titeln innehåller `'` med kontrollerade tecken kan onclick-attributet manipuleras. I dagsläget används `'`-escaping i `renderCard` (rad 112: `.replace(/'/g, "\\'")`), men rad 178 escaper inte titeln. Allvarlighetsgrad: **låg** (kräver att en titels `'`-tecken orsakar ett syntaxfel i onclick-strängen, inte godtycklig kodkörning).

---

## Inkonsistenser

- **recipe-browser.js:61–63 (GROUP_DEFS.time)** — `vardag30`-sektionen matchar `r.time && r.time <= 30`. `helg60` matchar `r.time && r.time > 30 && r.time <= 60`. Däremot matchar `longer` med `!r.time || r.time > 60`. Det innebär att ett recept med `time = 60` faller i `helg60`, men ett med `time = null` faller i `longer`. Tidsfiltret i filter-sheetet (app.js rad 144) lyssnar på checkboxar med värden `vardag30`/`helg60`/`longer`, och `timeBucket(r)` på rad 148–152 i recipe-browser.js är konsistent med GROUP_DEFS. Inkonsistensen är att `GROUP_DEFS.time.sections[0].match` och `timeBucket()` är dubbla implementationer av samma logik — om en ändras måste den andra uppdateras manuellt, utan synliga tester.

- **recipe-browser.js:61 vs. recipe-browser.js:148** — Samma tids-bucketlogik implementeras på två ställen: en gång som `match`-funktion i `GROUP_DEFS.time.sections` och en gång som `timeBucket()`. Dessa är inte anslutna; en ändring i en av dem bryter inte den andra automatiskt.

- **recipe-import.js:95** — `mimeType: 'image/jpeg'` hårdkodas alltid, oavsett om originalfilen är PNG eller HEIC. `resizeAndEncodeImage()` konverterar alltid till JPEG via canvas (korrekt), men om `mimeType` skickas till Gemini-backenden och backend:en använder det för att tolka bilden kan en mismatch uppstå om kanvaskodningen misslyckas. Konsekvent, men inte självdokumenterande.

- **app.js:107–113 (EXCLUDED_TAGS)** — Listan `EXCLUDED_TAGS` i app.js duplicerar en del av `CUISINE_TAGS` och `TYPE_TAGS` från recipe-browser.js. Om ett nytt kök-tag läggs till i `CUISINE_TAGS` måste det också läggas till i `EXCLUDED_TAGS` manuellt, annars dyker det upp som ett tagg-filter trots att det täcks av kök-grupperingen.

---

## Förbättringsförslag

- **recipe-browser.js:148–152 + GROUP_DEFS.time** — `timeBucket()`-funktionen och `GROUP_DEFS.time.sections[n].match` implementerar samma logik parallellt. Refaktorera `GROUP_DEFS.time.sections` att använda `timeBucket(r)` direkt: `match: r => timeBucket(r) === 'vardag30'` etc. Eliminerar risk för desynkronisering vid framtida ändring.

- **recipe-browser.js:227–241 (refreshStickyObserver)** — En ny `IntersectionObserver` skapas och registreras vid varje `renderRecipeBrowser()`-anrop. Den gamla disconnectas korrekt (rad 228), men om `renderRecipeBrowser()` anropas snabbt upprepade gånger (t.ex. vid varje tangenttryckning i sökfältet med 259 recept) skapas och disconnectas observatorer i snabb takt. Observatörer är relativt tunga objekt. **Förbättring:** Debounce sökfältets input-event (t.ex. 120 ms), som redan är registrerat i app.js rad 38.

- **recipe-browser.js:183** — `matchesSearch` itererar över `r.instructions` (kan vara 10+ steg) och `r.ingredients` (kan vara 20+ rader) för varje recept vid varje tangenttryckning. Med 259 recept och ingen debounce är detta ~5 000 strängoperationer per tangent. Acceptabelt idag, men en debounce (se ovan) löser det gratis.

- **recipe-editor.js:82 och 155** — `if (!res.ok) throw new Error()` kastar ett generellt Error utan meddelande. Backenden skickar sannolikt ett JSON-body med felorsak. Att läsa `await res.json()` och vidarebefordra `data.message` till användaren (som importFromUrl redan gör på rad 65) ger bättre felsökning.

- **recipe-import.js:127–135 (toSentenceCase)** — Funktionen detekterar ALL CAPS-titlar och normaliserar till sentence case. Logiken räknar bara bokstäver (a–z, å, ä, ö) och ignorerar siffror och specialtecken. En titel som `"KÖTTBULLAR MED 3 SÅSER"` tolkas korrekt (fler versaler än gemener). Men en titel som `"ABC"` (3 tecken, alla versaler) normaliseras till `"Abc"` vilket kan vara felaktigt för akronymer. Låg risk för ett recept-användningsfall men värt att notera.

---

## Testtäckning

- **recipe-browser.js:passesFilters** — Filterlogiken (AND mellan dimensioner, OR inom en dimension) har inga enhetstester. Specifikt bör testas: säsongsfilter ensamt, säsongsfilter + taggfilter kombinerat, filterkombination som ger nollresultat, recept utan `seasons`-fält (neutrala) mot aktiv säsongfilter. Risken är att en framtida ändring i `passesFilters` bryter kombinationslogiken tyst.

- **recipe-browser.js:mainIngredientOf** — MAIN_INGREDIENT_RULES-regexarna har inga tester. En ingredienslista med t.ex. "bönor" och "lax" bör testas för first-match-semantiken. Viktigt eftersom ordningen styr resultatet och regexarna är icke-triviala (t.ex. `\b(svarta|vita|...)\s*bönor\b`).

- **recipe-browser.js:timeBucket + GROUP_DEFS.time dubbel implementation** — Det finns inget test som bekräftar att de två implementationerna är synkroniserade. Ett enhetstest som kör båda för samma recept och jämför resultaten skulle fånga desynkronisering direkt.

- **recipe-import.js:resizeAndEncodeImage** — Bildomskalning och base64-kodning testas inte. Bör testas med: en bild som är exakt `maxPx` bred (scale=1), en bredare bild (scale<1), en bild som är porträttorienterad (höjd > bredd), en noll-pixel-fil (edge case).

- **recipe-import.js:toSentenceCase** — Funktionen testas inte. Bör täcka: helt gemener (oförändrad), helt versaler (normaliseras), blandat (oförändrad), tom sträng (returnerar `''`).
