# Review: Backend-kärna (receptval + inköpslista)

## Kritiska buggar

- **[api/generate.js:69–78]** — `fetchRecipes()` mappar receptfält manuellt men utelämnar `seasons`-fältet. Funktionen `applySeasonWeight()` (rad 23) läser `r.seasons || []` — men eftersom `r.seasons` aldrig sätts är det alltid `undefined`, och alla recept behandlas som "neutral" (vikt 1). Det innebär att `season_weight=true`-flaggan inte har någon effekt överhuvudtaget. Recept som taggades i Fas 6B (242 recept) påverkar aldrig poolen. Fix: lägg till `seasons: r.seasons || []` i mappingen på rad 76.

- **[api/_shared/shopping-builder.js:407–423 + rad 10 + rad 169]** — `categorize()` använder `lowWords.has(kw)` för enkelspalts-nyckelord sedan Session 49-fixen. Normaliserings-tabellen mappar all vitlök till kanonnamnet `vitlöksklyftor`, men `"vitlöksklyftor"` finns inte i `CATEGORY_KEYWORDS`. Tidigare matchade det via `low.includes("vitlök")` → Grönsaker; nu missar ordmängds-testet (`lowWords = {"vitlöksklyftor"}`, `lowWords.has("vitlök")` = false) → hamnar i Skafferi. Vitlök är en av de allra vanligaste ingredienserna i databasen. Fix: lägg till `"vitlöksklyftor"` i `CATEGORY_KEYWORDS.Grönsaker`.

## Potentiella buggar

- **[api/generate.js:175]** — `const turePool = pool.filter(hasTure)` deklareras men används aldrig i `selectRecipes()`. Den faktiska ture-logiken arbetar mot `dayPool`/`altPool`/`recipes` direkt via `tureOk()`-predikatet. Innebär inte felaktig logik, men en framtida refactor kan råka förlita sig på att `turePool` är aktuell (den är det inte — den reflekterar inte `weekdayPool`/`weekendPool`-bucketingen). Se även dead code-sektionen.

- **[api/generate.js:320–326]** — Ture-valideringen kontrollerar att `filtered.filter(hasTure).length >= ture_days`. Men `filtered` är alla tillgängliga recept efter proteinfiltrering, medan `pool` i `selectRecipes()` är historikfiltrerat. Om alla ture-recept råkar ligga i `recentIds` och poolen är precis stor nog utan dem, kan ture-dagarna ändå misslyckas med ett oprogrammatiskt fel (`pick()` kastar `"Kunde inte hitta recept ..."`). I praktiken är det extremt osannolikt med 3+ ture-recept och en 14-dagars historik, men valideringen ger ett falskt löfte om att generering alltid lyckas.

- **[api/_shared/shopping-builder.js:460–468]** — Loopen `for (const [key, item] of merged)` modifierar `merged` under iteration via `merged.delete(key)`. JS-specifikationen garanterar att en `Map` säkert kan tas bort ur under `for...of` (borttagna nycklar som ännu inte besökts hoppas över). Men om det finns två poster för samma ingrediens med olika små enheter (t.ex. `vitlöksklyftor||tsk` och `vitlöksklyftor||msk`), och den första träffen tar bort den andra nyckeln ur `merged` indirekt via att `item.name` matchar i `keysByName`-steget senare, kan ett litet antal ingredienser dubbelrapporteras till `noAmount`. Scenariot kräver exakt orderöverlappning och är svårt att trigga i praktiken.

- **[api/_shared/shopping-builder.js:499]** — `svKey`-sorteringsfunktionen ersätter `å/ä/ö` med `z` + null-byte (U+0001/U+0002/U+0003). Detta fungerar korrekt för alla ord som *börjar* med å/ä/ö jämfört med ord som börjar med a–y. Men för ett ord som börjar med `z` (`zucchini`) jämfört med `ä`-ord (`ärtor`): `svKey("zucchini")` = `"zucchini"`, `svKey("ärtor")` = `"zrtor"`. Jämförelsen `"zucchini"` vs `"zrtor"` → tredje tecken `"c"` (0x63) > `""` (0x02) → `ärtor` hamnar *före* `zucchini`. Rätt svensk ordning är tvärtom: z kommer *innan* å/ä/ö. I praktiken är `zucchini` enda ingrediensen med `z` och `ärtor` är sällan i samma kategori (Grönsaker), men om båda hamnar där sorteras de fel.

- **[api/generate.js:384–385]** — `getCurrentSeason(start_date)` anropas med en okontrollerad sträng från `req.body`. `new Date("ogiltig-sträng").getMonth()` returnerar `NaN` → `NaN + 1 = NaN` → ingen `if`-gren matchar → returnerar `"vinter"` som default. Inget kraschar, men fel säsong väljs tyst vid felaktigt datumformat. Valideringen ovan kontrollerar bara att `start_date` och `end_date` inte är tomma, inte att de är giltiga ISO-datum.

## Dead code

- **[api/generate.js:175]** — `const turePool = pool.filter(hasTure)` — tilldelas men aldrig läst. Sannolikt kvarleva från ett tidigt utkast av ture-logiken innan den nuvarande `tureOk()`-predikatsmodellen implementerades. Kan tas bort.

- **[api/_shared/shopping-builder.js:169]** — `"rödlökar": "rödlök"` är ett duplikat; exakt samma nyckel/värde finns redan på rad 10. JS-objekt tillåter inte duplikatnycklar — den första definitionen skrivs tyst över av den sista. Funktionellt inga fel (båda pekar på samma värde), men skapar förvirring. Ta bort definitionen på rad 169.

## Säkerhet

- **[api/generate.js:340–345]** — `fetch(WILLYS_URL, ...)` är hårdkodad och inte styrbar av klienten. `AbortSignal.timeout(5000)` begränsar hängtiden. Graceful fallback (`savingsById = null`) vid fel. Inga säkerhetsproblem.

- **[api/generate.js:296–307]** — Indata från `req.body` (`start_date`, `end_date`, `blocked_dates`, m.fl.) används utan strikt typvalidering. `blocked_dates` förväntas vara en array; om klienten skickar en sträng skapar `new Set("abc")` ett Set av enskilda tecken, vilket ger fel matchning. Påverkar bara den avsändande klienten och familjeappens gränssnitt skickar alltid korrekt format. **Allvarlighetsgrad: låg** (intern familjeapp, ingen autentisering avsedd, inga känsliga data att stjäla).

- **[api/_shared/github.js:43]** — `JSON.stringify(content, null, 2)` skriver hela datastrukturen till GitHub. Om `content` råkar innehålla cykliska referenser kraschar `JSON.stringify` med `TypeError`. I praktiken kontrollerar koden vad som skrivs (`weeklyPlan`, `updatedHistory`, etc.), men det finns ingen explicit guard. **Allvarlighetsgrad: låg**.

## Inkonsistenser

- **[api/generate.js:69–78 vs 20–32]** — `fetchRecipes()` mappar fält manuellt (`id`, `title`, `time`, `tags`, `protein`, `tested`, `ingredients`) utan `seasons`. `applySeasonWeight()` läser `r.seasons`. Inkonsistensen är direkt orsaken till den kritiska buggen ovan. Övriga ställen i koden (t.ex. `hasTure`) läser `r.tags` som korrekt mappas. Mönstret att mappa fält manuellt är generellt riskabelt — om ett nytt receptfält används i logiken måste man komma ihåg att lägga till det i mappingen.

- **[api/generate.js:281–293]** — Parametern heter `vegetarian_days` i `req.body` men variabeln i constraints heter `vegetarian_days` (konsekvent). Dock heter den motsvarande interna räknaren `vegCount` och Set:et `vegDaySet`. Namnmönstret `ture_days` → `tureCount` → `tureDaySet` är konsekvent, men `vegetarian_days` → `vegCount` → `vegDaySet` bryter prefixmönstret (borde vara `vegDays` eller liknande). Inte ett fel men försvårar läsning.

- **[api/_shared/shopping-builder.js:253–265]** — `parseFraction()` hanterar intervall (`"2-3"` → 3) men regex `[\d.]+\s*[–-]\s*([\d.]+)` fångar bara det *övre* värdet. Det är konsekvent dokumenterat som att ta max, men funktionsnamnet `parseFraction` antyder att det bara parsar bråk, inte intervall. `parseIngredient` anropar `parseFraction` för att hantera båda fallen, vilket är oklart.

## Förbättringsförslag

- **[api/generate.js:67–78]** — Byt ut den manuella fältmappingen i `fetchRecipes()` mot en whitelist-approach som explicit inkluderar alla fält som används i logiken: `const { id, title, time, tags, protein, tested, ingredients, seasons } = r`. Då syns det omedelbart i koden vilka fält som används, och om ett nytt fält tillkommer i logiken ger kompilatorn/linting inte varning — men det är åtminstone samlat på ett ställe.

- **[api/generate.js:251–252]** — `processingOrder.sort((a, b) => (tureDaySet.has(a) ? 0 : 1) - (tureDaySet.has(b) ? 0 : 1))` sorterar ture-dagar till fronten men bevarar inte ordningen inom respektive grupp (ture/icke-ture) — sorteringsalgoritmen är inte stabil i äldre Node-versioner. V8 (Node 11+) garanterar stabil sort, och Vercel kör Node 18+, så detta är OK i dag. Men ett explicit `a - b`-tie-breaker skulle göra intentionen tydligare.

- **[api/_shared/shopping-builder.js:434–505]** — `buildShoppingList()` itererar `merged` tre gånger efter initial ifyllning (PANTRY_ALWAYS_SKIP-rensning, SMALL_UNITS-rensning, keysByName-deduplicering). Alla tre loopar skulle kunna slås ihop till ett pass. Prestandan spelar troligen ingen roll (max ~400 ingredienser), men tre separata loopar gör flödet svårare att följa.

- **[api/generate.js:427–432]** — De tre parallella GitHub-skrivningarna (`weekly-plan.json`, `recipe-history.json`, `shopping-list.json`) i `Promise.all` skriver med samma `commitMsg`. GitHub API skapar tre separata commits med identiska meddelanden. Om en begäran misslyckas efter att de andra lyckats kan datan hamna i inkonsistent tillstånd (plan utan historik, eller historik utan plan). En sekventiell skrivning med en gemensam commit är omöjlig via Contents API, men att logga vilka skrivningar som lyckades vid partiellt fel hade förbättrat felsökbarheten.

## Testtäckning

- **[api/generate.js:applySeasonWeight]** — Funktionen saknar dedikerade tester. Det finns en kopia i `tests/select-recipes.test.js` men inga tester kör med `currentSeason != null`. Kritiskt eftersom säsongsfunktionen nu dessutom är bruten (se kritisk bugg ovan). Bör testas med in-season, off-season och neutral (inga seasons-taggar) recept.

- **[api/generate.js:getCurrentSeason]** — Ingen testning av gränsfall: månadsgränser (mars = vår, februari = vinter), ogiltigt datum, noll-datum. Funktionen är enkel men boundary-fallen (månad 3, 6, 9, 12) är enkla att testa och bekräfta korrekthet.

- **[api/generate.js:archiveOldPlan]** — Arkiveringsfunktionen saknar helt testtäckning. Logiken är icke-trivial: filter på `d.date < newStartDate && d.recipeId`, trimning av 30-dagars cutoff, hantering av saknad `plan-archive.json`. Fel här förstör historiken tyst (sväljer alla fel via `try/catch`).

- **[api/_shared/shopping-builder.js:categorize]** — `vitlöksklyftor → Skafferi`-regressionen (se kritisk bugg) hade fångats av ett specifikt regressionstest för vitlök-kategorisering. Det finns inga tester för `categorize()` direkt; all täckning är indirekt via `buildShoppingList()`. Rekommenderar `assertEq(categorize("vitlöksklyftor"), "Grönsaker", ...)` som test.

- **[api/_shared/shopping-builder.js:mergeItems (implicit)]** — Inget test för fallet att samma ingrediens förekommer med *olika* enheter (t.ex. `2 dl grädde` + `100 ml grädde`). Det korrekta beteendet (demoteras till noAmount utan mängd) är implementerat men otestat.
