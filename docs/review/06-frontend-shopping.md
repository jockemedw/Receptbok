# Review: Frontend — inköpslista + dispatch

## Kritiska buggar

- **[shopping-list.js:137]** — `removeManualItem`-knappen bygger sin `onclick` med sträng-interpolation: `onclick="event.stopPropagation();removeManualItem('${item.replace(/'/g, "\\'")}')"`. Escapen skyddar bara enkelfnuttar, inte dubbelfnuttar eller `<`/`>`. En vara som heter `O"Brien` producerar ogiltig HTML och ett syntaxfel i onclick-attributet. Eftersom varunamnet kommer direkt från `input.value` kan användaren skapa en vara med `"` i namnet och råka ur inköpslistan. Föreslagen fix: använd `data-item`-attribut och en delegerad event-lyssnare i stället för inline-onclick.

- **[shopping-list.js:94–95]** — Checkbox-nycklarna i `renderFullShoppingList` byggs som `` `recipe::${cat}::${idx}` ``. Om ett kategornamn innehåller `::` (osannolikt men möjligt via en framtida API-förändring) krockar nyckeln med en annan kategoris nycklar. Mer akut: nycklarna är index-baserade. Om ett manuellt tillägg läggs till och `loadShoppingTab` återrenderar listan, läses `_checkedItems` från servern och gamla index stämmer fortfarande (Sessionskommentar: `preserveChecked = true` vid `_freshShopContent`). Men om användaren bockar, sedan lägger till en vara och laddar om fliken utan `_freshShopContent` (t.ex. via tab-byte) kan serverns `checkedItems` ha index som förskjutits om manuella varor lagts till mitt i listan på servern. Konsekvens: fel varor visas som avbockade.

## Potentiella buggar

- **[shopping-list.js:202–224]** — `addManualItem` disable:ar knappen och väntar på fetch. Om användaren trycker Enter snabbt i inputfältet (onkeydown-lyssnaren i HTML) och sedan direkt klickar knappen igen hinner det gå ett anrop till, och knappen är fortfarande aktiverad tills fetch-löftet svarar. Dubbla identiska varor kan läggas till. Fix: disable:a input *och* knapp direkt vid submit och återaktivera i `finally`.

- **[shopping-list.js:188–199]** — `loadShoppingTab` anropar `initDispatchUI()` (rad 193) vid varje laddning. `initDispatchUI` gör ett GET `/api/dispatch-to-willys` varje gång fliken laddas, inklusive vid `addManualItem`/`removeManualItem` (som anropar `loadShoppingTab`). Det ger ett extra nätverksanrop vid varje manuell ändring. Ingen loop-risk, men onödigt. Edge case: om dispatch-feature-gaten råkar returnera `!featureAvailable` vid ett av dessa anrop, gömmer `btn.style.display = "none"` knappen trots att den syntes tidigare.

- **[dispatch-preferences.js:12–24]** — `loadPrefs` skyddar mot dubbelladdning via `prefsLoaded`-flaggan, men flaggan sätts i modulens stängning och överlever hela session. Om API-svaret misslyckas sätts ändå `prefsLoaded = true` — felaktiga defaults används permanent tills sidan laddas om. Fix: sätt bara `prefsLoaded = true` vid lyckat svar.

- **[dispatch-preferences.js:26–37]** — `savePrefs` kallas brandlöst (fire-and-forget) vid varje ändring av varumärkesblocklist och eko/svensk-toggle. Snabba ändringar i rad (t.ex. tre toggleklick) ger tre parallella POST-anrop utan seriegaranti. HTTP-ordningen garanteras inte i nätverket — ett tidigare anrop kan anlända sist och skriva över det senaste tillståndet. Fix: debounce-spara analogt med `scheduleCheckedSave` i shopping-list.js.

- **[dispatch-ui.js:50–71]** — `runDispatch` väntar på ett enda fetch-anrop utan timeout. Vercel Hobby har 15 sekunder som timeout men dispatchoperationen kan ta nära den gränsen. Om fetch-löftet hänger längre (t.ex. vid flaky nät) sitter användaren med en spinner utan feedback och ingen möjlighet att avbryta. Ingen AbortController används. Fix: `AbortController` med t.ex. 20 sekunders timeout.

- **[dispatch-ui.js:28–48]** — `openDispatchConfirm` räknar `totalCount` från `window._shopRecipeItems` och `window._shopManualItems`. Dessa räknar *alla* varor inklusive avbockade, men bekräftelsedialogen skriver "Skicka X ingredienser" som om alla ska handlas. Det faktiska dispatchet på servern filtrerar förmodligen inte heller på avbockade. Om användaren redan bockat av halva listan ger siffran ett vilseledande intryck.

- **[shopping-list.js:266]** — `copyShoppingList` använder `navigator.clipboard.writeText` utan att kontrollera om `navigator.clipboard` finns (kräver HTTPS eller localhost; fallback saknas för `http://`). I produktionsmiljön (Vercel HTTPS) är detta OK, men om appen öppnas via ett lokalt `file://`-schema misslyckas det tyst (catch-grenen i `navigator.clipboard.writeText.then` körs inte eftersom hela anropet kastar synkront). Låg risk i produktion.

## Dead code

- **[dispatch-preferences.js:61–67]** — Funktionen `renderBrandPills` definieras separat på rad 61–67 men anropas aldrig direkt; `renderPreferencesUI` bygger pillerna inline i sin HTML-sträng och anropar *inte* `renderBrandPills`. Den enda platsen `renderBrandPills` anropas är inuti `addBrand` (rad 75) och `removeBrand` (rad 82). Dessa anrop uppdaterar `#brandPills`-elementet som skapas av `renderPreferencesUI`. Det fungerar, men `renderBrandPills` är en duplikat av pill-genereringen i `renderPreferencesUI` (samma `.map`-uttryck). Kan konsolideras till en gemensam hjälpfunktion.

- **[dispatch-preferences.js:7]** — `DEFAULTS`-konstantens `preferOrganic: {}` och `preferSwedish: {}` används bara för spread på rad 9 (`let prefs = { ...DEFAULTS }`). Vid felaktig API-respons (`res.ok` är falskt) används `prefs = { ...DEFAULTS }` aldrig igen — koden faller igenom till `prefsLoaded = true` med `prefs` oförändrat (initialt `{ ...DEFAULTS }`). `DEFAULTS` är alltså bara en initial value och är inte skyddad mot mutation (objekten `preferOrganic: {}` och `preferSwedish: {}` är nya objekt vid spread, vilket är korrekt, men om `DEFAULTS` hade delat referenser vore det en bugg). Ingen aktiv risk men förvirrande struktur.

## Säkerhet

- **[shopping-list.js:134–136]** — `item`-strängen från `window._shopManualItems` interpoleras direkt in i HTML vid rendering av `<span class="item-text">${item}</span>` och i `removeManualItem`-onclick-attributet. Manuella varor sparas och hämtas från servern via `shopping-list.json`. Om en annan klient (eller en manuell GitHub API-förändring) infogar en sträng som `<img src=x onerror=alert(1)>` i `manualItems`-arrayen injiceras den ofiltrerad i DOM. `item-text`-spanen sätts via `innerHTML` (rad 158: `document.getElementById('shoppingList').innerHTML = checkHtml`). Allvarlighetsgrad: **medel** — familjeapp utan externa användare, men GitHub PAT-gissning eller en komprometterad session kan trigga detta.

- **[shopping-list.js:94–96]** — Av samma skäl interpoleras `item`-strängar från `recipeItems` (som kommer från `shopping-list.json` via GitHub CDN) rakt in i `onclick`-attributet och `item-text`-spanen utan sanitisering. Allvarlighetsgrad: **låg** — `recipeItems` genereras av backend-logiken från `recipes.json`-ingredienser som inte är användarkontrollerade, men konsekvens vid kedjeattack är desamma som ovan.

- **[dispatch-preferences.js:64–65 och 98]** — Varumärkesnamn från `prefs.blockedBrands` (som ursprungligen kommer från `brandInput`-fältet) sanitiseras med `escapeHtml` innan de renderas som HTML i pill-elementen och label-elementen. Det är korrekt. Däremot interpoleras `escapeHtml(b)` *utan* citattecken-escaping i `onclick="removeBrand('${escapeHtml(b)}')"` — `escapeHtml` konverterar `'` till `&#39;` vilket är HTML-entities men inte JS-string-escaping i ett onclick-attribut. Det gör att ett varumärke med enkelfnutt, t.ex. `l'oréal`, ger `onclick="removeBrand('l&#39;oréal')"` vilket webbläsaren parsar korrekt (attributparser expanderar entity). Ingen direkt risk, men mönstret är skömt. Allvarlighetsgrad: **låg**.

- **[dispatch-preferences.js:69–77]** — `addBrand` läser `input.value.trim().toLowerCase()` men lägger ingen maxlängd. En extremt lång sträng sparas till servern via `savePrefs` och lagras i GitHub-repot. Allvarlighetsgrad: **låg** — familjeapp, men borde ha `input.value = input.value.slice(0, 100)` eller HTML `maxlength`.

## Inkonsistenser

- **[dispatch-preferences.js:239 vs dispatch-ui.js:115]** — Båda filerna definierar en lokal `escapeHtml`-funktion med identisk implementation. Funktionen borde extraheras till `utils.js` och exporteras.

- **[shopping-list.js:202 kontra index.html:284]** — `addManualItem` har default-parametrar `inputId = 'manualItemInput'` och `btnId = 'manualAddBtn'`. I HTML på rad 284 kallas den utan argument: `onclick="addManualItem()"`. På rad 264 (shopNoData-sektionen) kallas den med explicit ID. Defaultparameter-mönstret fungerar men gör den explicita formen i "Empty"-sektionen ologisk — varför inte alltid använda defaults med distinkta ID:n?

- **[dispatch-ui.js:13]** — `initDispatchUI` anropar `initPreferences()` (importerat från `dispatch-preferences.js`) men returnerar ingenting och ger inget sätt för anroparen att veta när preferences laddats. Mönstret i `shopping-list.js:193` är `if (typeof window.initDispatchUI === 'function') window.initDispatchUI()` utan await. `initPreferences` är async men avvaktas inte. Preferences-UI kan renderas innan prefs laddats klart. Namngivning: `initDispatchUI` gör mer än dispatch-UI — den laddar och renderar preferences, vilket inte framgår av namnet.

- **[shopping-list.js:274 vs 165]** — `renderShoppingData` (rad 274) och `loadShoppingTab` (rad 165) delar nästan identisk logik för att extrahera `hasRecipe`/`hasManual` och anropa `renderFullShoppingList`. Duplikationen är acceptabel men fragmenterad — en liten ändring i hasRecipe-logiken måste göras på två ställen.

## Förbättringsförslag

- **[shopping-list.js:39–77]** — `rebuildShopText` duplicerar exakt den textblock-genereringslogik som redan finns i `renderFullShoppingList` (raderna 109–126 resp. 148–155). Vid en ändring i textformatet måste båda platserna uppdateras. Förslag: extrahera en `buildTextHtml(recipeItems, manualItems, checkedItems)` hjälpfunktion och kalla den från båda ställena.

- **[dispatch-preferences.js:91–138]** — `renderPreferencesUI` bygger hela HTML-strängen inklusive formulärfält. Varje anrop som behöver uppdatera listan (t.ex. efter en ändring i categorier) kräver en fullständig omrendering av hela sektionen, vilket tappar eventuell fokus i `brandInput`. En mindre inkrementell uppdatering (uppdatera bara pill-containern och toggle-sektionerna) vore mer robust.

- **[dispatch-preferences.js:211–231]** — `copyAIPrompt` anropar `document.querySelector(".shop-dispatch-prompt-btn")` i stället för `document.getElementById(...)` med ett unikt ID. Om det finns flera element med klassen `.shop-dispatch-prompt-btn` (osannolikt men möjligt) väljs fel element. Föreslagen fix: ge knappen ett unikt ID och använd `getElementById`.

- **[shopping-list.js:202–224]** — `addManualItem` saknar maxlängdsvalidering på klientsidan. Servern kan ha validering, men ett tomt fält stoppas korrekt (rad 205: `if (!item) return`). En vara på 1000+ tecken ser konstig ut i listan. Enkel fix: `if (item.length > 200) return;` alternativt `maxlength`-attribut på input i HTML.

- **[shopping-list.js:17–28]** — `scheduleCheckedSave` ignorerar nätverksfel helt tyst. Det är ett medvetet val (kommentaren "tyst fel"), men om servern konsekvent misslyckas (t.ex. GITHUB_PAT gick ut) försvinner alla bockningar utan feedback till användaren. En räknare för misslyckade sparningar som visar en diskret toastnotis efter t.ex. 3 på rad vore mer användarvänligt.

## Testtäckning

- **[shopping-list.js:renderFullShoppingList]** — Nyckelgenereringen `` `recipe::${cat}::${idx}` `` och checkbox-preservation-logiken (`preserveChecked`-flaggan) har inga tester. Borde testas: (1) att befintliga bockar bevaras vid tillägg av manuell vara, (2) att bockar inte "smiter" över till fel vara när listan renderas om med ny data.

- **[dispatch-preferences.js:buildPrompt]** — `buildPrompt` är ren logik utan sidoeffekter och lätt att isolera, men saknar tester. Borde testas: (1) att avbockade varor inkluderas, (2) att avbockade varor exkluderas, (3) att `blockedBrands` hamnar korrekt i output, (4) att `null` returneras om alla varor är avbockade.

- **[dispatch-preferences.js:loadPrefs]** — Logiken kring `prefsLoaded`-flaggan (felet sätter ändå flaggan) borde testas: (1) att defaults används vid nätverksfel, (2) att `loadPrefs` inte gör ett nytt anrop vid andra anrop om det lyckades, (3) att defaults *inte* permanentas om API-anropet misslyckas (dvs. flaggan borde inte sättas vid fel — se Potentiella buggar ovan).

- **[shopping-list.js:addManualItem]** — Race condition vid snabba dubbelsubmit (se Potentiella buggar) borde täckas av ett test som simulerar att `fetch` tar tid och knappen klickas igen under väntetiden.
