# Review: Testsvit (täckning + kvalitet)

## Kritiska buggar

- **[select-recipes.test.js:174 vs generate.js:174]** — **Inline-kopian saknar `turePool`-variabeln.** I `generate.js` (rad 174–175) skapas `const turePool = pool.filter(hasTure)` omedelbart efter att `tureCount` beräknas. Den raden saknas helt i inline-kopian i testfilen. Variabeln används dock inte vidare i `selectRecipes` i vare sig produktionskoden eller kopian (turePool skapas men läses aldrig — se Potentiella buggar nedan), vilket innebär att divergensen just nu inte orsakar ett felaktigt testresultat. Men om `turePool` någonsin börjar användas i produktionskoden och inline-kopian inte synkas, kommer tester att passera trots att logiken skiljt sig. **Föreslagen fix:** Lägg till `const turePool = pool.filter(hasTure);` på rad 174 i inline-kopian för att hålla den identisk med källkoden, alternativt ta bort raden ur generate.js om den inte används.

- **[generate.js:174]** — **`turePool` skapas men används aldrig.** Variabeln `const turePool = pool.filter(hasTure)` deklareras och den dyrare filtreringen körs vid varje `selectRecipes`-anrop, men resultatet refereras inte någonstans i funktionen. Det är dead code i produktionskod som körs i varje generering. **Föreslagen fix:** Ta bort raden tills den faktiskt behövs, eller börja använda den i `pick()`-looparna för ture-dagar.

- **[generate.js:262–267 vs select-recipes.test.js:161]** — **Felmeddelandet i `throw new Error` skiljer sig.** Produktionskoden genererar ett detaljerat felmeddelande: `"Kunde inte hitta recept för ${day.day} (${day.date}) — ${isTureDay ? ...}"`. Inline-kopian (testfilen rad 161) kastar: `"Kunde inte hitta recept för ${day.day} — ingen kandidat tillgänglig."`. Ingen test verifierar felmeddelandet, men eftersom det är en inline-kopia som ska vara identisk är detta en divergens. Vid nästa uppdatering av felmeddelandet i generate.js (t.ex. för att visa på svenska för användaren) kan testet fortsätta passera medan produktionskoden beter sig annorlunda i edge cases.

- **[select-recipes.test.js:174 / generate.js:174]** — **`constraints.ture_days` vs `constraints.ture_days || 0`.** I inline-kopian (testfilen rad 78) sätts `const tureCount = constraints.ture_days || 0;`. I `generate.js` (rad 174) är det `const tureCount = constraints.ture_days;` (utan `|| 0`). Om `constraints.ture_days` är `undefined` i produktionskoden och testet inte skickar in `ture_days: 0` i `DEFAULT_CONSTRAINTS` (det gör det numera, men historiskt inte), beter sig de två olika. Just nu är det godartad divergens — men den visar att kopiorna inte underhålls konsistent.


## Potentiella buggar

- **[shopping.test.js:197]** — **`assertFalse(all.some(s => s.includes("salt") && !s.includes("soja")))` har ett logikfel.** Testet ska verifiera att "salt" filtreras bort, men negationen med `!s.includes("soja")` gör att en post som är exakt `"sojasalt (X g)"` eller liknande (en hypotetisk normalisering) också skulle passera testet. Mer korrekt vore att testa direkt att `"salt"` inte finns som enskilt element: `assertFalse(all.some(s => s === "salt" || s.startsWith("salt (")))`.

- **[select-recipes.test.js:312–333]** — **Slumptestet (Test 4, 20 iterationer) kan i teorin flaka vid extremt liten receptpool.** Poolen har 11 recept för 5 dagar, 3 proteiner har 3 recept vardera, men `vegCount=1` innebär att en veg-slot läggs till. Vid proteinbalans-cap 2 och 5 slots kan edge cases uppstå om shuffle ordnar proteiner olyckligt och fallback-looparna tvingas använda veg-recept på icke-veg-dagar. Testet kommenterar detta och väljer en tillräckligt rik pool — risken är låg men inte noll.

- **[select-recipes.test.js:357–359]** — **Test 5 (helg-matchning) verifierar bara att minst ETT helg60-recept finns på lördag eller söndag**, inte att båda dagarna har helg60-recept. Med 2 helg60-recept (id 6, 7) och 2 helgdagar är det möjligt att en helgdag får ett vardag30-recept om pool-logiken faller till altPool. Testet godkänner det beteendet implicit, men det kanske inte är det avsedda beteendet.

- **[cookies-endpoint.test.js:130]** — **Test G räknar `GET`-anrop och förväntar sig 2 totalt** — en initial GET vid `readUser`, en intern GET vid `writeUser`. Det testet är fragilt mot implementation: om `writeUser` någonsin optimeras för att inte göra en intern GET-fetch (utan bara patcha det befintliga cachetillståndet) skulle testet fela trots korrekt beteende.

- **[dispatch-to-willys.test.js:474–476]** — **Test R7 testar att `storeId` hämtas från `env` när gist-posten saknar det, men verifierar inte att `cookie` och `csrf` fortfarande kommer från gist.** Det är möjligt att `resolveWillysSecrets` returnerar en blandning av gist- och env-värden på ett sätt som är svårt att felsöka i produktion om det uppstår en halv-valideringsbugg.


## Dead code

- **[generate.js:174]** — `const turePool = pool.filter(hasTure);` — variabeln deklareras och filtrering körs men resultatet används aldrig i `selectRecipes`. Se Kritiska buggar ovan.

- **[select-recipes.test.js:291–295]** — Kommentarblocket (rader 291–295) beskriver en ansats med "bara kyckling-recept" som sedan överges och ersätts med `mixed`-poolen. Den döda koden/kommentaren förklarar visserligen designvalet men lämnar kvar det oanvända `recipes`-variabeln (5 kyckling-poster) som aldrig används i det faktiska testet. Inget funktionsproblem, men gör testkoden svårläst.

- **[match.test.js:183]** — `console.log("✓ Alla regressiontester godkända.")` med unicode-bock `✓` — de övriga testfilerna använder ren ASCII i sina slutrader (`"Alla select-recipes-regressiontester godkanda."` etc). Inkonsekvent men inte farligt.


## Säkerhet

- **[dispatch-to-willys.test.js:412–418]** — Testdata innehåller hårdkodade strängar som liknar skarpa hemliga värden (`"g_cookie"`, `"e_csrf"`, `"g_store"`) — dessa är dock uppenbart falska testvärden och utgör ingen risk.

- **[cookies-endpoint.test.js:161–165]** — `runRefresh` tas in direkt från produktionskod och anropas med `secretHeader: undefined`. Om validering av `undefined` någonsin ändras till att jämföra med en tom sträng (`""`) istället för att kasta, kan testet passera medan en säkerhetslucka öppnas. Risken är låg men värd att notera.

*(Inga ytterligare säkerhetsfynd med hög konfidens.)*


## Inkonsistenser

- **[dispatch-to-willys.test.js:22 vs select-recipes.test.js:184]** — `failures.push` använder `"❌ "` (emoji) i dispatch- och cookies-testerna, men enbart `"  FAIL "` i select-recipes och shopping. Inkonsekvent felformatering försvårar grep/filtrering på `FAIL` i CI-loggar. Samtliga testfiler borde använda samma prefix.

- **[shopping.test.js:197 vs select-recipes.test.js:179]** — `assertEq` i shopping.test.js jämför med `===` (rad 28), medan `assertEq` i cookies-endpoint.test.js (rad 13) jämför med `JSON.stringify(actual) === JSON.stringify(expected)`. Båda kallas `assertEq` men har olika semantik — `JSON.stringify`-varianten klarar objekt men ger missvisande felmeddelanden vid `undefined` (serialiseras till `undefined` inte strängen `"undefined"`).

- **[select-recipes.test.js:199–206]** — Kommentaren på rad 198 säger `"måndag=2026-04-20 är en måndag"` men datumen i `VECKA` börjar på 2026-04-21 (tisdag). Kommentaren är fel — 2026-04-21 är en tisdag, inte måndag. Skapar förvirring vid debuggning. Att daglistan börjar på tisdag och kallar det "måndag" stämmer inte med DAY_NAMES-logiken i generate.js.


## Förbättringsförslag

- **[select-recipes.test.js:26–28]** — Varningskompmentaren "håll synkroniserad med api/generate.js" räcker inte. Ett bättre mönster vore att lägga `selectRecipes` och `bucketBySaving` i en separat `api/_shared/select-recipes.js`-modul och exportera dem direkt — då försvinner behovet av inline-kopiering helt och divergensrisken elimineras. Detta är den enda riktiga lösningen på inline-kopia-problemet.

- **[select-recipes.test.js:312–333]** — Slumptester med 20 iterationer ger ett falskt förtroende. Om sannolikheten för ett fel per iteration är 5% är risken för att det slinker igenom på 20 körningar ca 36%. Antingen bör antalet iterationer höjas ordentligt (100+) eller bör testet använda en seeded slumpgenerator. `history.js:shuffle` tar för tillfället ingen seed — om en seed lades till i shuffle-API:et skulle testerna bli deterministiska och reproducerbara.

- **[shopping.test.js:213–224]** — Merge-testet (Test 9) verifierar att `grädde` summeras till 3 dl och `pasta` till 300 g, men testar enbart med `assertTrue(arr.some(s => s.includes("grädde") && s.includes("3")))`. Det stämmer även om posten är `"grädde (13 dl)"`. Exaktare vore `assertEq` mot exakt strängen `"grädde (3 dl)"`.

- **[match.test.js:1–182]** — Testfilen testar `matchRecipe` och `extractOfferCanon` men inte `matchRecipes` (den exporterade listwrappern i willys-matcher.js rad 78–80). Även om funktionen är trivial (ett `map`) borde den täckas för att fånga regressioner i exportnamnet.

- **[cookies-endpoint.test.js:144–155]** — `fakeStore` i testet implementerar bara `writeUser`, inte `readUser`. Om `runRefresh` någonsin börjar anropa `readUser` (t.ex. för idempotency-check) kastar testerna `TypeError: store.readUser is not a function` utan tydlig förklaring. Lägg till `readUser: async () => null` i `fakeStore` som defensivt default.


## Testtäckning

- **[generate.js:buildDayList]** — Funktionen `buildDayList` saknar egna tester. Den hanterar DST-övergångar, skottår och veckonumrering. En bugg här skulle ge fel datumordering i hela planen. Borde testas med: (a) en vecka som spänner över DST-skifte, (b) ett år med 29 februari, (c) start=slut (ett dag-plan).

- **[generate.js:filterRecipes]** — `filterRecipes` saknar tester. Den filtrerar bort recept som inte matchar `allowed_proteins` eller saknar `vardag30`/`helg60`-taggar. Edge cases: tom `allowed_proteins`-lista, recept med `tested: null` (vs `tested: false`).

- **[generate.js:updateHistory]** — `updateHistory` saknar tester. Funktionen mergar ny historik in i befintlig — en bugg här kan orsaka att recept aldrig roteras ur historiken (om id:t stringifieras på fel sätt) eller att gamla poster aldrig tas bort (beskärningstiden är dock i `recentlyUsedIds` i history.js, ej här).

- **[generate.js:archiveOldPlan]** — `archiveOldPlan` saknar tester. Felhanteringen är tyst (`try/catch` kastar bort felet), men logiken som avgör vilka dagar som arkiveras (jämförelse `d.date < newStartDate`) är lätt att få fel. Borde testas med: (a) överlappande planer, (b) arkiv som är äldre än 30 dagar (trimning), (c) plan-archive.json saknas (första körningen).

- **[shopping-builder.js:buildShoppingList — `noAmount`-logiken]** — `noAmount`-flödet (ingredienser utan mängd som läggs till direkt per namn) testas indirekt, men det specifika scenariot "samma ingrediens finns som både `merged` och `noAmount`" (`alreadyCovered`-checken rad 491) har inget explicit test. Det är ett edge case som uppstår när ett recept har `"2 dl grädde"` och ett annat har bara `"grädde"` (utan mängd).

- **[willys-matcher.js:matchRecipes]** — `matchRecipes` (plural, rad 78–80) exporteras men testas inte alls.

- **[dispatch-to-willys.js:runDispatch — `verifyCart`-resultaten]** — `verifyCart` anropas i slutet av dispatch men resultatet används bara för loggning/response-konstruktion. Ingen test verifierar att svaret från `verifyCart` faktiskt inkluderas i `result`-objektet (t.ex. `result.cartEntries`). Om formatet ändras i API-svaret märks det inte av testerna.
