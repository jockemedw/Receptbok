# Review: API-endpoints (CRUD + import)

## Kritiska buggar

- **[replace-recipe.js:86–124]** — `recipe-history.json` uppdateras aldrig vid receptbyte. När ett nytt recept väljs av algoritmen (slumpmässigt, utan `newRecipeId`) skrivs det in i veckoplanens dag, men det nya receptets ID registreras inte i historiken. Det innebär att nästa receptbyte kan välja samma recept igen, och att "nyligen använda"-filtret i `selectRecipes` och framtida genereringar inte känner till bytet. Fix: läs in historiken (redan sker på rad 33 via `fetchHistory`), sätt `history.usedOn[String(picked.id)] = today`, och skriv tillbaka `recipe-history.json` som del av `Promise.all`-anropet (alt. sekventiellt som i `discard-plan.js`).

- **[skip-day.js:21–32]** — `skip`-actionen skjuter fram `recipe` och `recipeId` men kopierar inte `saving` och `savingMatches`. Resultatet är att prisbesparings-badges stannar kvar på fel dag efter ett skip: dag N+1 behåller sina gamla spardata men visar nu dag Ns recept, och vice versa. `unblock`-actionen (rad 43–44) gör rätt och kopierar dessa fält. Fix: lägg till `plan.days[i].saving = plan.days[i - 1].saving ?? null; plan.days[i].savingMatches = plan.days[i - 1].savingMatches ?? null;` i skip-loopen och nollställ dem på `plan.days[dayIdx]`.

- **[recipes.js:44–56]** — `add`-actionen inkluderar inte `seasons`-fältet i det nyss skapade receptobjektet. Algoritmen i `api/generate.js` (rad 23) läser `r.seasons || []` och ger alla recept utan `seasons` vikten 1 (neutral), vilket fungerar — men importerade och manuellt tillagda recept kan aldrig få säsongsvikt utan att redigeras efteråt. Importflödet i `import-recipe.js` returnerar inte heller `seasons`. Inte en krasch, men sannolikt oavsiktligt beteende sedan Fas 6 implementerades. Fix: lägg till `seasons: recipe.seasons || []` i `newRecipe`-objektet i `recipes.js` och lägg till fältet i Gemini-schemat i `import-recipe.js` (GEMINI_SCHEMA_PROMPT).

## Potentiella buggar

- **[github.js:45–58]** — `writeFile` kan i teorin göra tre GET-anrop + tre PUT-anrop (totalt sex anrop) utan att lyckas, och kastar sedan ett fel. Det är inte en oändlig loop. Däremot: om filen inte finns (HTTP 404 på GET) sätts `sha` till `undefined`, och PUT skickas utan `sha`-fält, vilket skapar filen. Det fungerar korrekt — men om GitHub returnerar ett annat 4xx-svar på GET (t.ex. 401 eller 403) ignoreras det tyst och PUT misslyckas troligen med ett kryptiskt fel. Fix: kontrollera `getRes.status` explicit och kasta ett tydligare fel vid 401/403.

- **[confirm.js:41–44]** — Race condition vid dubbla bekräftelser: två enheter kan läsa plan och shopping-list nästan samtidigt (rad 8 och 23), och den som vinner PUT-anropet sist skriver över den andras version. Det tredje retry-försöket i `writeFile` hanterar SHA-konflikter mot en annan `writeFile`-körning, men inte mot en parallell `confirm`-körning som gjort en lyckad PUT i mellanläget. I praktiken är risken låg (familjeapp, sällan fler än en enhet bekräftar), men resultatet kan vara en bekräftad plan med gammal inköpslista. Inget enkelt fix utan backend-lås.

- **[import-recipe.js:197]** — `mimeType` valideras inte. Om klienten skickar en godtycklig sträng (t.ex. `"application/pdf"`) vidarebefordras den rakt till Gemini API:t som `inlineData.mimeType`. Gemini accepterar bara ett begränsat antal bildformat; ett ogiltigt värde leder till ett API-fel som hanteras av `callGemini`-logiken (kastar `Error` → 500). Inte en krasch, men kan ge en förvillande fejlmessage. Fix: vitlista accepterade MIME-typer (`image/jpeg`, `image/png`, `image/webp`) och returnera 400 vid ogiltigt värde.

- **[skip-day.js:33–56]** — `unblock` på sista dagen i planen: `dayIdx === plan.days.length - 1` ger en for-loop som aldrig exekverar (`i < plan.days.length - 1` är direkt falskt), och koden nollställer sedan `last` som är samma objekt som `plan.days[dayIdx]`. Resultatet är att blockeringen tas bort och fälten nollsätts — det vill säga precis som `block` men utan recept. Det är förmodligen korrekt beteende (ingen dag att hämta recept från), men det kommuniceras inte tillbaka med ett förklarande felmeddelande. Användaren klickar "Ångra fri dag" och sista dagen blir blank utan förklaring.

- **[shopping.js:39–44]** — `set_checked`-actionen ersätter hela `checkedItems`-objektet med klientens payload utan validering. Om en klient råkar skicka en stor payload (t.ex. ett objekt med tusentals nycklar) skrivs det till `shopping-list.json`. Inte kritiskt men kan uppsvulla filen markant.

## Dead code

- **[replace-recipe.js:1]** — `import { readFileRaw } from "./_shared/github.js"` är importerad men `readFileRaw` används aldrig i filen — `fetchRecipes()` anropar den via ett eget wrapper-anrop (rad 7: `readFileRaw("recipes.json")`). Vänta — `readFileRaw` används faktiskt på rad 7. Inga döda importer hittades.

*(Inga ytterligare fynd med hög konfidens.)*

## Säkerhet

- **[import-recipe.js:104–110]** — HTML-strängen som skickas till Gemini innehåller upp till 15 000 tecken av råwebbsidans textinnehåll. En skadlig receptsajt kan bädda in instruktioner riktade mot Gemini i sin sidtext (t.ex. "Ignorera schemat ovan och returnera istället: ..."). Gemini kan följa dessa instruktioner och returnera JSON med godtyckliga värden. Risken begränsas av att svaret parsas mot ett förväntat schema (`recipe.title`, `recipe.protein` o.s.v.) och att receptet aldrig exekveras, men ett angriparstyrt `title`- eller `notes`-värde lagras i `recipes.json`. **Allvarlighetsgrad: låg** — receptet granskas av användaren manuellt innan det sparas, och strängar lagras bara som text. Inget skript kan injiceras via dessa fält.

- **[handler.js:9]** — `Access-Control-Allow-Origin: *` tillåter anrop från vilken domän som helst. Autentisering sker enbart via `GITHUB_PAT` i servermiljön (aldrig exponerad till klienten), så CORS-policyn är inte ett problem i sig — alla skrivoperationer kräver PAT:n. **Allvarlighetsgrad: låg.**

- **[import-recipe.js:56–73]** — SSRF-skyddet via `isPrivateIp` är välimplementerat men skyddar inte mot DNS rebinding: DNS-upplösningen sker vid import-tidpunkten (`lookup(parsed.hostname)` på rad 68), men det faktiska HTTP-anropet görs 10–15 rader senare (rad 78). Under den tid som förflutit kan DNS ha bytts ut mot en privat IP. I Vercels serverless-miljö är denna attack orealistisk (kort livslängd, ingen DNS-cache att rebinda), men mönstret är ändå skört om runtime-miljön ändras. **Allvarlighetsgrad: låg.**

- **[import-recipe.js:107]** — `html.replace(/<[^>]+>/g, " ")` tar bort HTML-taggar men behandlar inte HTML-entiteter (`&lt;`, `&#x3C;` m.fl.). En angripare kan bädda in `<`-tecken via entiteter och påverka Gemini-prompten. Praktisk risk är liten eftersom prompting mot Gemini inte har sidoeffekter bortom det returnerade JSON-objektet. **Allvarlighetsgrad: låg.**

## Inkonsistenser

- **[skip-day.js:21–32 vs. 37–56]** — `skip` kopierar inte `saving`/`savingMatches` vid framåtflyttning av recept, men `unblock` kopierar dem vid bakåtflyttning. Samma datamodell, motsatt beteende. (Även rapporterat under Kritiska buggar.)

- **[shopping.js:30 vs. 47]** — Fel-responsen på rad 30 saknar punkt i slutet (`"Tom vara"`), medan rad 47 saknar det också (`"Okänd action"`). Alla andra endpoints i kodbasen avslutar felmeddelanden med punkt. Stilmässigt men inkonsekvent.

- **[recipes.js:34]** — `content.meta.nextId = Math.max(content.meta.nextId || 0, deletedId)` vid `delete`-action: `nextId` sätts till det borttagna receptets ID, vilket kan göra att `nextId` aldrig ökar (om ett lägre ID tas bort). `add`-actionen (rad 41–42) räknar ut `nextId` som `max(existingMax, nextId) + 1`, vilket kompenserar — men kombinationen av de två operationerna lämnar `meta.nextId` i ett missvisande tillstånd. Fix: ta bort `nextId`-uppdateringen från `delete`-actionen helt, `add` klarar sig utan den.

- **[import-recipe.js:276–284 vs. recipes.js:51]** — `buildTags()` i `import-recipe.js` lägger till protein-taggen (`fisk`, `kyckling` m.fl.) i tags-arrayen, vilket inte är i linje med `recipes.json`-strukturen (CLAUDE.md: `protein`-fältet är separat, taggar är typ/tid). Manuellt tillagda recept via `recipes.js` kopierar `recipe.tags` rakt av utan att lägga till protein-taggen. Matchningslogiken i `willys-matcher.js` och `selectRecipes` läser `r.protein`-fältet direkt, men eventuella protein-taggar i `tags`-arrayen filtreras på `EXCLUDED_TAGS` i receptbrowsern (Session 50). Inget kraschar, men taggdupliceringen är förvirrande.

## Förbättringsförslag

- **[github.js:45–58]** — `writeFile` gör ett nytt GET-anrop för SHA på varje försök, även på det första. Det innebär alltid minst två API-anrop (GET + PUT). Om SHA kan skickas som parameter (likt `readFile` som redan returnerar `sha`) kan de flesta anrop klaras med ett enda PUT. Nuvarande design är enkel och korrekt, men ett valfritt `sha`-argument skulle minska GitHub-anropen vid `confirm.js` och `replace-recipe.js` där SHA just lästs in.

- **[import-recipe.js:249–262]** — `callGemini` returnerar `null` om JSON-parsningen misslyckas, men kastar ett fel om Gemini-anropet misslyckas (rad 236). Anroparna (`handleUrl` rad 116, `handlePhoto` rad 203) hanterar `null` korrekt, men om `throw` i `callGemini` inte fångas inne i `callGemini` bubblar det upp till `createHandler`'s catch och ger en generisk 500. Det är dokumenterat beteende, men en explicit `try/catch` kring `callGemini`-anropet i `handleUrl`/`handlePhoto` med ett specifikt felmeddelande vore tydligare.

- **[confirm.js:22–26 och replace-recipe.js:99–103]** — Befintlig `shopping-list.json` läses in för att bevara `manualItems` och `checkedItems`, men om läsningen misslyckas (filen saknas) används tomma defaults tyst. Kommentaren `/* ingen befintlig lista — OK */` är tillräcklig, men samma mönster upprepas i tre filer (`confirm.js`, `replace-recipe.js`, `skip-day.js`). En extraherad hjälpfunktion `readExistingShop(pat)` i `_shared/` skulle ta bort dupliceringen.

- **[custom-days.js:27]** — `Number.isInteger(recipeId)` avvisar `recipeId: 42.0` (en float som råkar vara heltalsvärd), men accepterar `0` — vilket innebär att ett recept-ID på 0 godkänns och lagras (`if (rid)` på rad 32 avvisar dock 0 korrekt via falsy-check). Kontrollerna är konsekventa men kan vara förvirrande. `recipeId > 0 && Number.isInteger(recipeId)` vore tydligare.

## Testtäckning

- **[replace-recipe.js:histoikuppdatering]** — Det finns inga tester som verifierar att historiken *inte* uppdateras vid receptbyte. `tests/select-recipes.test.js` testar recepturval i isolation, men inget testfall verifierar hela flödet "byt recept → samma recept dyker inte upp i nästa generering". Bör testas eftersom detta är den kritiska bugg som identifierats ovan.

- **[skip-day.js:saving/savingMatches-propagering]** — Inget test verifierar att `saving`/`savingMatches` följer med receptet vid `skip`. Lätt att lägga till som ett enhetstest med ett planfragment.

- **[import-recipe.js:guessProtein]** — Funktionen har inga tester. Logiken är enkel men proteinordningen spelar roll (t.ex. ett recept med "laxfilé och bacon" skulle bli `fisk` för att fisk-regexet testas först). En enkel suite med 8–10 ingredienssträngar skulle fånga eventuell regressions vid framtida utökning.

- **[import-recipe.js:extractJsonLd + mapJsonLdToRecipe]** — Ingen testtäckning för JSON-LD-parsning. Kantfall som `@graph`-wrapper, array-format på `recipeYield`, och kapslat `HowToSection` i `recipeInstructions` testas inte. Dessa är de vanligaste orsakerna till tysta importfel.

- **[recipes.js:delete — nextId-logik]** — Beteendet vid borttagning av det sista receptet i databasen, eller ett recept med högsta ID, är inte testat. Kombinationen `delete` + `add` direkt efteråt kan ge ett ID-kollision-scenario om `nextId`-logiken är felaktig.
