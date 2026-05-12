# Review: Willys-integration (dispatch + matchning)

## Kritiska buggar

- **`dispatch-to-willys.js:59`** — `fetch(SHOPPING_LIST_URL + "?t=" + Date.now())` saknar felhantering. Om Willys-korgen är OK men shopping-list.json inte kan hämtas (GitHub nere, 404, etc.) kastar `.json()` på ett felaktigt svar ett undantag som fångas av den yttre `catch`-blocket och returnerar ett generiskt `"internal"`-fel, utan att skilja på "inget nät" vs. "inga varor". Föreslagen fix: kontrollera `res.ok` innan `.json()`, och returnera ett tydligt `{ ok: false, error: "shopping_list_unavailable" }`.

- **`secrets-store.js:55–79`** — `writeUser` anropar `fetchGist()` direkt (kringgår cachen) för att läsa färskt tillstånd, skriver sedan PATCH och sätter `cache = { data, fetchedAt: now }`. Om PATCH-anropet misslyckas (rad 77 kastar) är cachen inte uppdaterad, men om en tidigare `getData()`-cache fortfarande är varm (TTL inte passerat) kan ett omedelbart `readUser`-anrop returnera *stale* data från den gamla cachen — d.v.s. cookie/csrf som precis skrevs men som inte syns i cachen. Scenariot: Chrome-extensionen POSTar cookies (writeUser OK), sekunden efter triggas dispatch (readUser cache-hit med gammal data). Föreslagen fix: anropa `clearCache()` i början av `writeUser` så att nästa läsning alltid hämtar det nyss sparade värdet.

---

## Potentiella buggar

- **`api/_shared/willys-matcher.js:31`** — `extractOfferCanon` delar erbjudandetexten på `[\s,\-()\/]+`. Bindestreck som teckenklass (`\-`) kräver att strecket är i början eller slutet av klassen för att tolkas som ett literalt bindestreck. I mitten av en klass (`[a\-z]`) tolkar vissa regex-motorer det som ett interval. I praktiken fungerar det i V8 just nu, men ett säkrare skrivsätt är `[\s,\-()/]+` med strecket sist i klassen.

- **`api/_shared/shopping-builder.js:353–359`** — `CANON_REJECT_PATTERNS` saknar mönster för flera vanliga missmatch-klasser som ännu inte observerats i produktion men är lätta att konstruera:
  - `"lök"` har inget mönster — "Lök Vit Stor" kan matcha recept som skriver `rödlök` (om `normalizeName("rödlök")` av någon anledning returnerar `"lök"` via token-scan-fallback på ett framtida recept).
  - `"fisk"` har mönster för `fiskpinnar|fiskbullar` men innehåller stavningsdubletten `fiskbullar` två gånger i mönstret: `/\b(fiskpinnar|fiskbullar|fiskbullar)\b/i`. Dubbletten är harmlös men indikerar att mönstret inte granskats noggrant.
  - `"olivolja"` saknar reject-mönster trots att Willys säljer olivoljebaserade dressingar och marinobjektet som kan få canon `"olivolja"` via `NORMALIZATION_TABLE["extra virgin olivolja"]`.

- **`api/_shared/shopping-builder.js:380–404`** — `normalizeName` Fallback 2 skannar tokens *baklänges* och returnerar första canon-träff. Om ett recept innehåller "riven parmesan och basilika" returnerar token-scannen `"basilika"` (sista token som är canon) istället för `"parmesan"`. N-gram-fallbacken (Fallback 3) skulle ge rätt svar via `"riven parmesan"`, men den körs *efter* Fallback 2 som redan returnerat fel. Scenariot är ovanligt men möjligt vid komplexa ingredienssträngar.

- **`willys-offers.js:24–49`** — `NON_FOOD_RE` är byggd med `.join("|")` på en array av termer — ingen av termerna är escaped som regex-mönster. Existerande termer innehåller inga regex-specialtecken, men om en framtida term läggs till med punkt, parentes eller plus (t.ex. `"sun lotion"` har redan ett blanksteg som fungerar som `\s+` i regex-motorn — troligtvis avsiktligt, men ostadigt). Termen `"moisture bomb"` och `"deo roll"` matchar varsomhelst i texten inklusive t.ex. ett erbjudande som råkar heta `"Smördegsroll"` om "roll" läggs till ensamt. I nuläget är termen `"deo roll"` tvåordig och kräver exakt understrängsmatch, vilket är OK, men mönstret har ingen ordgräns (`\b`) runt de tvåordiga termerna.

- **`dispatch-to-willys.js:44`** — `userId` är hardkodat till `"joakim"` i produktionskoden. Samma userId används i handler och i `resolveWillysSecrets`. Om appen i framtiden ska stödja fler familjemedlemmar (Fas 5B) kräver det en refaktorering på flera ställen. Inte en bugg i dagsläget, men en stilltyst antagande som kan orsaka fel om userId-logiken utökas utan att alla anrop uppdateras.

- **`willys-offers.js:65–68`** — Ingen timeout på Willys-anropet via `fetchImpl`. Om Willys API hänger svarar Vercel-funktionen med timeout efter ~15 s utan ett begripligt felmeddelande. En `AbortController` med t.ex. 8 s timeout skulle ge bättre feldiagnostik.

- **`api/_shared/willys-search.js:17`** — Sökklienten har ingen timeout och ingen retry vid nätverksfel. Om Willys `/search`-endpoint returnerar HTTP 429 (rate limit) eller 503 under dispatch returnerar `findProductByCanon` `null` och produkten hamnar i `unmatched`-listan utan varning om att felet var tillfälligt.

---

## Dead code

- **`api/_shared/willys-cart-client.js:56–64`** — `verifyCart()`-funktionen är implementerad och returneras från `createCartClient`, men anropas aldrig i `dispatch-to-willys.js` eller i testerna (test D anropar den men den testar bara klienten, inte att `runDispatch` använder den). Funktionen är tillgänglig men har ingen plats i dispatch-flödet idag.

- **`api/_shared/willys-matcher.js:43–51`** — `extractRecipeCanons()` är en privat hjälpfunktion som används uteslutande av `matchRecipe()`. Funktionen är inte exporterad. Inget problem i sig, men om den används av test-kod någonstans bör det kontrolleras. (Den används inte i nuvarande tester — testerna kallar `matchRecipe` direkt.) Inte dead code, men värd att notera.

---

## Säkerhet

- **`dispatch-to-willys.js:94`** — `console.error("dispatch-to-willys error:", err?.message || err)` i det yttre catch-blocket loggar `err.message`. Om ett underliggande bibliotek (t.ex. en `fetch`-implementation) råkar inkludera URL med cookie-parameter i felmeddelandet (t.ex. vid redirect-fel) kan cookievärden hamna i Vercel-loggarna. Allvarlighetsgrad: **låg** — nuvarande `fetch`-anrop inkluderar cookies i header, inte URL, men det är ett mönster att vara medveten om.

- **`api/_shared/secrets-store.js:22–36`** — Gist-innehållet tolkas med `JSON.parse(file.content)` utan validering av strukturen. Om gistens innehåll manipuleras (t.ex. av en angripare som fått tillgång till GitHub-tokenet) och innehåller ett objekt med `__proto__`- eller `constructor`-nycklar på toppnivå kan det potentiellt påverka objektprototypen via `data.users[userId] = {...}`. I Node.js är detta en känd prototype pollution-vektor om `JSON.parse`-resultatet direkt assignas till ett objekt. Allvarlighetsgrad: **medel** — exploaterbar bara om angriparen redan har write-access till gisten (d.v.s. har stulna GitHub-credentials), men ett `Object.create(null)`-baserat objekt eller explicit validering av `users`-strukturen skulle eliminera risken.

- **`api/willys-offers.js:80–83`** — `req.query?.store` valideras med `/^\d{3,5}$/` vilket begränsar input till siffror. Det är tillräckligt för att förhindra injection i URL-parametern `q=<storeId>`. Allvarlighetsgrad: **ingen** — korrekt hanterat.

- **`dispatch-to-willys.js:107–127`** — `handleRefreshCookies` returnerar `{ error: "Server saknar konfiguration (env vars)." }` om `expectedSecret` saknas. Det avslöjar att endpoint finns men inte är konfigurerad, vilket kan hjälpa en angripare att kartlägga konfigurationstillståndet. Allvarlighetsgrad: **låg** — ändring till generisk 404 vid saknad konfiguration vore mer defensivt.

---

## Inkonsistenser

- **`dispatch-to-willys.js:28` vs. `handler.js:5`** — Alla andra endpoints använder `createHandler()`-wrappern från `handler.js` (som hanterar CORS, OPTIONS och PAT-kontroll). `dispatch-to-willys.js` implementerar CORS och OPTIONS-hantering manuellt (rad 29–32) och kringgår wrappern helt. Beteendet är funktionellt identiskt, men inkonsistensen gör det svårare att förstå vilka endpoints som är wrappade. Undantaget motiveras av att endpointen behöver både GET och POST (wrappern tillåter bara POST), men detta bör kommenteras explicit.

- **`willys-offers.js:102` vs. `willys-matcher.js:29`** — `normalizeOffers()` är exporterad från `willys-offers.js` men används aldrig direkt utifrån — den anropas bara internt av `fetchOffersFromWillys`. `extractOfferCanon()` och `rejectsMatch()` i `willys-matcher.js` exporteras och används av två moduler (`willys-search.js` och `dispatch-matcher.js`). Det är konsekvent, men `normalizeOffers` borde eventuellt vara privat (non-export) för tydlighetens skull.

- **`dispatch-to-willys.js:221` vs. `api/_shared/dispatch-matcher.js:14`** — Exakt canonextrahering sker på två ställen: `extractCanonsFromShoppingList` (i dispatch-endpointen) anropar `parseIngredient` + `normalizeName` för att bygga canon-listan, och `findReaMatch` (i dispatch-matcher) anropar `extractOfferCanon` för att sätta offer-canonet. Dessa funktioner är *logiskt* konsekventa men i ett gränsfall — om en ingrediens passerar `normalizeName` men inte `extractOfferCanon` (eller vice versa) missar de varandra. En gemensam `toCanon()`-abstraktion som wrappade båda vägar vore tydligare.

- **`api/_shared/willys-search.js:16` och `willys-offers.js:57`** — Båda modulerna skickar `User-Agent: "Receptbok/1.0 (familjematplanering)"` men i `willys-search.js` är headern en sträng i ett objekt-literal, medan `willys-cart-client.js:10` definierar en separat `UA`-konstant med fullständig browser-UA-sträng. Tre olika User-Agent-värden i tre filer — Willys server kan potentiellt flagga inkonsekventa UA-strängar från samma IP-källflöde.

---

## Förbättringsförslag

- **`secrets-store.js:39–47`** — `getData()` är inte "concurrency-safe" vid parallella serverless-anrop. Om två Vercel-instanser kallar `readUser` (utan cache) parallellt gör de var sin GET mot gisten. Det är OK för läsning. Men om `writeUser` anropas parallellt från två instanser gör båda var sin `fetchGist()` → PATCH-sekvens, och den sist skrivna vinner (last-write-wins). Kommentaren på rad 9–13 bekräftar detta. För ett single-user-flöde är risken negligerbar, men om man i framtiden stödjer fler användare bör ett `ETag`-baserat optimistic lock läggas till.

- **`dispatch-to-willys.js:59`** — Shopping-listan hämtas via raw GitHub URL vid varje dispatch-anrop (`?t=Date.now()` för cache-bust). Det är ett onödigt extra HTTP-anrop — endpointen tar redan emot ett POST-body; shoppinglistan skulle kunna skickas med i POST-bodyn från klienten (som redan har den i minnet). Det eliminerar ett nätverkshop och gör koden lättare att testa.

- **`api/_shared/dispatch-matcher.js:19–46`** — Loopen kör alla search-anrop sekventiellt (`for...of` med `await`). En vanlig inköpslista har 15–25 ingredienser. Sekventiell sökning mot Willys-API:et kan ta upp till 25 × RTT (uppskattningsvis 200–400 ms per anrop i sämsta fall) = 5–10 sekunder. `Promise.all()` med en concurrency-limit på t.ex. 5 parallella anrop vore avsevärt snabbare och håller sig under eventuell rate-limiting.

- **`willys-offers.js:102–132`** — `normalizeOffers` filtrerar bort erbjudanden där `regularPrice` eller `promoPrice` är `null`. Det är korrekt, men `savingPerUnit` tillåts vara `null` och ersätts inte. I `willys-matcher.js:71` används `offer.savingPerUnit || 0` som fallback, vilket döljer att Willys ibland inte rapporterar sparbelopp (t.ex. vid X-för-Y-erbjudanden). En explicit `savingPerUnit: savingPerUnit ?? 0` i `normalizeOffers` vore tydligare och konsekvent.

- **`api/_shared/willys-matcher.js:29–41`** — `extractOfferCanon` returnerar `null` om ingen träff hittas och loggloggar inget. Under en typisk vecka med 199 erbjudanden är det sannolikt att ~50–80% inte matchar något recept-canon. Det vore värdefullt att vid debug-läge logga offer-namn som inte extraherar canon, för att kunna identifiera framtida lexikonluckor.

---

## Testtäckning

- **`secrets-store.js:writeUser`** — Scenariot "writeUser + omedelbart readUser inom TTL-fönster ser uppdaterade värden" testas (test G i `cookies-endpoint.test.js`). Dock testas inte fallet där `writeUser` kastar halvvägs (t.ex. PATCH misslyckas) och cachen befinner sig i ett inkonsekvent tillstånd. Borde testas med ett fake-fetchImpl som returnerar `{ ok: false }` på PATCH och verifierar att cachen fortfarande är i ursprungsläget.

- **`dispatch-to-willys.js:extractCanonsFromShoppingList`** — Funktionen är privat (inte exporterad) och testas indirekt via `runDispatch`. Det saknas ett direkt test för kantfallet `shoppingList.categories` (gamla formatet) jämfört med `shoppingList.recipeItems` (nya formatet). Om Willys-dispatch körs mot en lagrad `shopping-list.json` i gammalt format (`categories`-nyckeln) fungerar det pga. `|| shoppingList.categories` på rad 221 — men detta beteende saknar testfall.

- **`willys-offers.js:normalizeOffers`** — Funktionen är exporterad men saknar tester. Specifikt borde testas: (1) att `SubtotalOrderPromotion` filtreras bort, (2) att `isNonFood` korrekt avvisar kattmat och rengöringsmedel, (3) att erbjudanden med `regularPrice: null` eller `promoPrice: null` inte hamnar i resultatlistan.

- **`api/_shared/willys-matcher.js:matchRecipes`** — `matchRecipes` (pluralform) är en trivial `.map()`-wrapper och behöver inget eget test, men `extractRecipeCanons` (privat funktion) saknar direkt testning. Om normalizering av ingredienser ändras kan `matchRecipe` ge fel utan att någon assertion fångar det — ett test med ett recept vars ingredienser kräver alla tre normalizerings-fallbacks (direkt, adjektiv-strip, token-scan) vore bra regressionssudd.

- **`dispatch-to-willys.js:handleRefreshCookies`** — Den inre `handleRefreshCookies`-funktionen testas inte alls. `runRefresh` (som den delegerar till) täcks i `cookies-endpoint.test.js`, men själva HTTP-lagret (att metod-kontroll på GET returnerar 405, att saknad `WILLYS_REFRESH_SECRET` ger 500) är otestat.
