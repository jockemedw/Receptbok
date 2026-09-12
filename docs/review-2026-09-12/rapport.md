# Projektgranskning: Receptboken

Granskad 2026-09-12 · commit `31a8b8cd1af7f4813aea1484d6209c1f5c9b9afe` · main.

**Rekommendation: prioritera tillförlitlighet i det gemensamma vardagsflödet, därefter inköpsupplevelsen och återanvändning av familjens matvanor.** Appen har redan tillräcklig funktionell bredd för en familj. Störst nytta kommer nu från att kunna lita på att middagar, bockar och anteckningar finns kvar, att inköpslistan följer exakt valda dagar och att bra veckor går att återanvända.

Granskningen innehåller **14 prioriterade fel-/riskgrupper, tre förbättringar av utveckling och drift samt 12 produktförslag**. Flera problem var redan dokumenterade; här skiljs fortfarande aktuella kända fynd från nya fynd och nya varianter. Detta är en bred kod- och produktgranskning, inte ett intyg om att varje möjlig bugg är identifierad.

## 1. Omfattning och bevis

Granskningen omfattar frontendens fem flikar, receptimport och matlagningsläge, backendens autentisering och dataflöden, plan- och inköpsmutationer, SQL-migrationer, PWA/cache, CI, testbarhet och befintlig roadmap. Tre avgränsade delgranskningar gjordes med GPT-5.6 Sol; huvudgranskningen kontrollerade källkod, körde hela sviten och sammanställde prioriteringen. Viktiga fynd fick ytterligare körbar felinjektion.

| Kontroll | Resultat och begränsning |
|---|---|
| Befintlig Node-testsvit | Samtliga 14 `tests/*.test.js` passerade. Vissa testfall loggar avsiktliga simulerade fel. |
| Syntax | Alla JavaScript-filer under `js/` och `api/` passerade `node --check`. |
| Webbläsare | Alla fem flikar öppnades; inga JavaScript-/konsolfel i harnessen. |
| Visuell granskning | Tio skärmbilder granskade: fem flikar i ljust och mörkt läge, 390 × 844 CSS-pixlar. Ingen horisontell dokumentoverflow i dessa vyer. |
| Isolerade reproduktioner | Bekräftade planförlust vid RPC-fel, ofullständig inköpsavslutning, falsk sparstatus, tappade checkbox-skrivningar, felaktig mängdvisning och proteinklassning. |
| Databas/produktion | Ingen live-mutation, ingen migrationskörning, inget riktigt köp och ingen deploy. Live-RLS, index, installerade migrationer och faktisk butikskoppling är inte verifierade. |

Webbläsaren var lokal Edge via Playwright, med mobil viewport, syntetisk Supabase-data, 120 ms simulerad databaslatens och ersatta typsnitt. Externa anrop blockerades. Service workers blockerades för att isoleringen skulle hålla. Därför är detta **inte en iPhone/Safari-verifiering, verklig fontgranskning eller mätning av produktionscache/offlinefunktion**. Inga påståenden om verklig mobilhastighet görs utifrån dessa siffror.

[Webbläsarresultat](browser-results.json) · [Idag, ljust](light-idag.png) · [Idag, mörkt](dark-idag.png) · [Matsedel](light-vecka.png) · [Inköp](light-shop.png) · [Recept](light-recept.png) · [Listor](light-listor.png).

Prioritet: **P1** = åtgärda före fortsatt breddning när det gäller säkerhet, tappad data eller felaktigt kärnflöde. **P2** = planera efter P1. Ett scenario kan vara kodbevisat utan att ha observerats i produktion. ”Ny” betyder att ingen motsvarighet identifierades i de tidigare granskningar som jämfördes; det är inte ett påstående om när buggen infördes.

## 2. Prioriterade fel och risker

### R01 · P1 · Butikskorgen kan ändras utan inloggning; kontonamn kan exponeras

**Känd POST-lucka, ny identifierad GET-del. Kodbevisat.** [dispatch-to-willys.js](../../api/dispatch-to-willys.js), rad 49–107 och 120–143, kräver JWT för att spara/radera inloggningsuppgifter men inte för vanlig GET eller POST. POST kan använda den sparade butikssessionen för att fylla varukorgen. GET returnerar `connectedAs`, härlett ur sparat användarnamn. GET-exponeringen förutsätter att sparade kontouppgifter faktiskt finns. CORS `*` är inte ett autentiseringsskydd.

**Förslag:** skydda vanlig GET och POST med JWT och hushållsbehörighet. Behåll extensionens separat autentiserade cookie-refresh. Byt samtidigt klientens vanliga `fetch` i [dispatch-ui.js](../../js/shopping/dispatch-ui.js), rad 28 och 218, till `apiFetch`, annars bryts befintligt flöde. Testa 401 utan token och oförändrad extensionväg. Ingen skarp exploatering gjordes.

### R02 · P1 · Misslyckad ny matsedel kan lämna den aktiva planen utan dagar

**Känd F219/F232; reproducerad med aktuell kod.** [generate.js](../../api/generate.js), rad 155–178, skriver nya dagar med upsert innan aktiveringen. Vid överlappande datum byts gamla raders `plan_id` till en ännu inaktiv plan. Aktiveringen sker senare, rad 233–249 och 457–460. Migration 011 gör inte hela kedjan atomär; JavaScript skriver fortfarande före RPC:n.

**Reproduktion:** gammal aktiv plan 1 och ny plan 101 täckte samma två datum. Efter lyckad upsert men injicerat RPC-fel var plan 1 fortfarande aktiv med **0 dagar**; båda dagarna tillhörde inaktiva plan 101. Riktiga exporter kördes mot testsvitens minnesdatabas.

**Förslag:** en sammanhållen databastransaktion som validerar aktuella dagar, skriver den nya planen, bevarar egna dagar och aktiverar. Samtidiga genereringar och nytillkomna egna dagar behöver samma konfliktskydd. Långsam receptberäkning kan göras före transaktionen, men förutsättningarna måste kontrolleras på nytt vid skrivning. Testa överlapp, fel vid varje steg och två samtidiga försök.

### R03 · P1 · ”Vi har handlat” kan fastna halvvägs och inte repareras med försök igen

**Nytt fynd, reproducerat.** [shopping-store.js](../../api/_shared/shopping-store.js), rad 348–389, stämplar dagarna som inhandlade före konverteringen av obockade receptvaror till egna tillägg. Om läsningen/konverteringen av varor misslyckas finns stämpeln redan kvar. Nästa försök returnerar tidigt eftersom inga oinhandlade dagar återstår.

**Reproduktion:** injicerat läsfel efter stämpling gav felmeddelande. Ett nytt anrop gav `{shoppedDates: [], converted: 0}`. Den obockade varan förblev `source: recipe`. Vid ett senare ombygge riskerar den att tappas i stället för att följa med som eget tillägg.

**Förslag:** stämpel och konvertering i samma transaktion, med ett återupprepningsbart anrop. Acceptanskriterium: fel lämnar hela rundan oförändrad, eller ett nytt försök slutför den utan dubbel effekt.

### R04 · P1 · Anteckningar kan visa ”Sparad” trots att texten inte sparats

**Nytt fynd, reproducerat.** [lists-view.js](../../js/lists/lists-view.js), rad 1131–1150, skriver nya värden i den lokala modellen före databassvaret. Vid fel återställs inte modellen. Nästa sparning jämför formuläret med den redan ändrade modellen och visar ”Sparad” utan nytt databasanrop.

**Reproduktion:** första försöket gjorde ett databasanrop och visade ”Kunde inte spara”. Andra försöket gjorde **0 nya anrop**, visade ”Sparad”, medan databasmodellen fortfarande innehöll gammal text.

**Förslag:** håll senast bekräftad version separat från utkastet och behåll ändringen som osparad tills den kvitterats. Status ska vara ”Sparar”, ”Sparad” eller ”Kunde inte spara – försök igen”, aldrig en gissning från lokal likhet. Testa även om äldre svar kommer efter nyare text.

### R05 · P1 · Bockningar kan tappas utan fungerande återförsök

**Delvis nytt; mobil-livscykelrisken tidigare F253.** [shopping-list.js](../../js/shopping/shopping-list.js), rad 491–509, tömmer kön och väntar på `Promise.all` utan att kontrollera resultatens `error`. Supabase-svar med `{error}` är därför inte fångade av `catch`. [lists-view.js](../../js/lists/lists-view.js), rad 556–575, kontrollerar fel men återlägger inte misslyckade poster i kön.

**Reproduktion för inköp:** två uppfyllda promises med `{error}` gav tom kö, ingen toast och inga nya anrop vid en andra flush. Kontrolltest med riktiga promise-rejections återlade däremot posterna. Detta överensstämmer med Supabases dokumenterade mönster att läsa `error` från uppdateringssvaret. [Supabase: update](https://supabase.com/docs/reference/javascript/update).

**Förslag:** kontrollera varje resultat, återlägg bara misslyckade skrivningar utan att skriva över nyare togglingar och visa osparad status. Hantera flikens livscykel. Att telefonen suspenderas under debounce är en risk; det har inte reproducerats på fysisk telefon i denna runda.

### R06 · P1 · Receptbyte kan göra inköpslistan fel för de dagar familjen valt

**Nytt fynd, kodbevisat.** [replace-recipe.js](../../api/replace-recipe.js), rad 130–159, använder `plan.confirmed_at` som villkor för listombygge och lägger alltid till den utbytta dagen. Det strider mot den nuvarande regeln att listan ska täcka exakt valda dagar, beskriven i [day-picker.js](../../js/shopping/day-picker.js), rad 1–11.

**Två scenarier:** välj tisdag till listan från ett obekräftat förslag och byt sedan tisdagens recept: listan byggs inte om och behåller gamla ingredienser. Bekräfta en plan, välj endast måndag och byt onsdagens recept: onsdag kan automatiskt läggas till trots att den inte valts. Tom täckning kan dessutom utlösa fallback till hela planen.

**Förslag:** styr på faktisk listtäckning. Ett byte på en täckt dag uppdaterar ingredienserna; en otäckt dag ska inte automatiskt läggas till. För redan inhandlad middag: erbjud ett uttryckligt val att handla de nya ingredienserna. Testmatris: bekräftad/obekräftad × täckt/otäckt/inhandlad.

### R07 · P1 · Dagflyttningar saknar skydd mot samtidiga telefoner och delfel

**Känd problemklass i ny endpoint; kodbevisad skrivordning, samtidighetsutfall härlett.** [day.js](../../api/day.js), rad 47–85 och 172–178, läser en ögonblicksbild, beräknar rotationen och skriver upsert följt av separat delete. Om delete misslyckas kan samma innehåll ligga kvar på två datum. Två enheter kan även räkna från samma gamla läge och skriva över varandra. Lokal invariantkontroll och en klientlokal busy-flagga skyddar inte mellan enheterna.

**Förslag:** versionskontroll med begripligt konfliktsvar eller låst transaktion som omfattar läsning och skrivning. Alla konkurrerande skrivvägar måste respektera samma modell; lås i bara en endpoint räcker inte. Transaktionsbundna advisory locks är ett möjligt verktyg, men kräver samordning mellan anropande kod. [PostgreSQL: explicit locking](https://www.postgresql.org/docs/17/explicit-locking.html).

### R08 · P1 · Byte av aktiv inköpslista är inte sammanhållet

**Känd problemklass, aktuell implementation återgranskad. Kodbevisat.** [shopping-store.js](../../api/_shared/shopping-store.js), rad 133–202, skapar lista/varor, deaktiverar gamla listor, aktiverar ny lista och uppdaterar dagkopplingar i separata anrop. Deaktiveringens fel kontrolleras inte. Beroende på felpunkt kan det finnas ingen aktiv lista, flera aktiva listor eller felaktiga dagkopplingar.

**Förslag:** transaktion för hela bytet och databasregel för högst en aktiv lista per hushåll. Inspektera befintliga index och dubbletter före införandet; deras livestatus är okänd. Bevara manuella varor och bockningar även när en annan enhet ändrar listan under ombyggnad.

### R09 · P1 före externa hushåll · Inloggad användare kopplas inte till rätt hushåll i backend

**Känd blockerare #5–#6. Kodbevisat, huvudsakligen latent i en-hushållsdrift.** [supabase.js](../../api/_shared/supabase.js), rad 28–49, väljer och cachar första hushållet globalt. `req.user` används inte för detta. Backendens service-role kringgår RLS, så frontendens hushållsfilter löser inte problemet.

**Förslag:** härled hushåll från verifierad användare och medlemskap, neka saknat medlemskap och nyckla eventuell cache per användare/hushåll. Verifiera två isolerade hushåll och en användare utan medlemskap genom samtliga skrivande endpoints. Självregistrering bör inte öppnas innan detta är klart.

### R10 · P1 · Matlagningsläget ändrar mängder även utan portionsskalning

**Nytt avrundningsfel, reproducerat. Bråkproblemet känt som F291.** [cook-mode.js](../../js/ui/cook-mode.js), rad 43–83 och 139–145, rundar nästan alla enheter till närmaste fjärdedel med minimum 0,25. Det körs även när skalfaktorn är 1.

| Ursprung | Visat vid oförändrade portioner |
|---|---|
| 0,1 kg mjöl | 0,25 kg mjöl |
| 0,3 kg kött | 0,25 kg kött |
| 0,1 l grädde | 0,25 l grädde |

Även den fulla initialvägen genom `openCookMode` reproducerade mängdändringen. Unicode-bråk som `½ dl` parsas inte och förblir oförändrade när portioner dubbleras.

**Förslag:** bevara ursprungsmängden vid faktor 1. Vid verklig skalning: använd enhetsanpassad precision och normalisera bråk; metrisk vikt/volym ska inte ha ett generellt 0,25-golv. Återanvänd verifierad ingredienslogik där det är möjligt. Testa ekvivalenta enheter, exempelvis 100 g och 0,1 kg.

### R11 · P2 · Utländska recept kan felklassas som vegetariska

**Känd F115, reproducerad klassificering.** [import-recipe.js](../../api/import-recipe.js), rad 249–253, klassar protein före översättning. `guessProtein`, rad 389–395, känner huvudsakligen svenska ord. Översättningen rad 266–294 uppdaterar inte protein/taggar. ”Chicken Alfredo” med ”2 chicken breasts” klassades som `vegetarisk` i isolerat test.

**Förslag:** klassificera och validera efter konverteringen; visa tydligt proteinval i importgranskningen. Okänd ingrediens är inte belägg för vegetarisk rätt. Testa engelska, svenska och blandade titlar/ingredienser.

### R12 · P2 · Säsongsmetadata försvinner på vägen från import till sparning

**Känd F278. Kodbevisat när importsvaret innehåller säsonger.** [recipe-import.js](../../js/recipes/recipe-import.js), rad 153–165, för inte vidare metadata; [recipe-editor.js](../../js/recipes/recipe-editor.js), rad 152–162, sätter `seasons: []` vid skapande. Det gör att tillgänglig säsongsinformation inte når urvalsalgoritmen.

**Förslag:** bevara importutkastets metadata och exponera redigerbara säsonger. Testa hela kedjan import → förhandsgranskning → spara → läs tillbaka. Det kräver inte att alla importer måste få automatiskt gissade säsonger.

### R13 · P2 · Zoom och tangentbordsåtkomst behöver rättas

**Känt och fortfarande aktuellt.** [index.html](../../index.html), rad 5, begär `user-scalable=no` och maximal skala 1. [plan-viewer-deluxe.js](../../js/weekly-plan/plan-viewer-deluxe.js), rad 589–695, renderar de flesta klickbara dagkort utan tangentbordsstöd. DOM-kontrollen i webbläsaren hittade sju klickbara dagartiklar, varav endast en hade `role=button` och `tabindex=0`.

**Förslag:** tillåt zoom och ge varje primär dagåtgärd en riktig tangentbordsåtkomlig kontroll; undvik att skapa nästlade knappar i kort som redan har andra kontroller. Verifiera fokus, Enter/Space och förstoring på de viktigaste flödena. W3C beskriver målet att text ska kunna förstoras till 200 procent utan förlorad funktion. [W3C: Resize Text](https://www.w3.org/WAI/WCAG21/Understanding/resize-text).

### R14 · P2 · Offline-/cachevägen kan lagra en felsida och vänta obegränsat på nätet

**Kända F137/F254 och prestanda Batch B; aktuell versionsavvikelse.** [service-worker.js](../../service-worker.js), rad 50–60, cachar navigeringssvar utan `res.ok`. En 5xx-sida kan ersätta den tidigare offline-startsidan. Cache-skrivningar är inte inväntade, och nät-först saknar timeout. Precache anger CSS v197 medan [index.html](../../index.html), rad 20, begär v199.

**Förslag:** cacha endast lyckade svar, koppla cachearbetet till service workerns livstid och begränsa nätväntan. Automatisera versionskopplingen mellan HTML och assets. En snabb cachad startsida är inte samma sak som fungerande offline-data. Detta fynd bygger på kod; service worker-funktionaliteten testades inte i webbläsarharnessen eftersom den blockerades där.

## 3. Produktförbättringar och nya funktioner

Ordningen nedan utgår från nytta för den egna familjen. Arbetsstorlek S/M/L är relativ, inte en tids- eller kostnadsoffert. Flera idéer finns redan i roadmapen; värdet här är en avgränsad första version och en motiverad ordning.

| Prioritet | Förslag | Första användbara version | Nytta och framgångskriterium | Storlek / ursprung |
|---|---|---|---|---|
| 1 | **Tydlig och ärlig sparstatus** | Gemensamt mönster för Sparar/Sparad/Kunde inte spara i anteckningar och listor; manuell retry som bevarar aktuell ändring. | Familjen vet om den andra telefonen faktiskt kan se ändringen. Inget misslyckat anrop får visas som sparat. | M · ny sammanhållen förbättring, R04–R05. |
| 2 | **Inköpslista med tydliga middagsstatusar** | Visa Ej vald / På listan / Inhandlad och ”Listan gäller tis–tors”. Vid receptbyte visas vad som tillkommer och försvinner. | Färre felköp; listan motsvarar exakt avsikten. Utgår från befintliga dagkopplingar. | M · vidareutveckling av inköpsrundor, R06. |
| 3 | **Familjefavoriter: ”Laga igen”** | Ett enkelt hjärta eller tre val: gärna igen / okej / hoppa över. Filter för favoriter; vikta urvalet men behåll variation. | Familjens erfarenhet påverkar nästa meny. Mät hur ofta ett förslag byts ut och om det minskar. | M · befintlig Fas 2/#16, börja mindre än individuell betygsmotor. |
| 4 | **Lunchlådor och rester som riktiga planval** | ”Laga dubbelt på tisdag → rester torsdag”, länkat till ursprungsreceptet. Ingredienser räknas vid tillagningen en gång. | Färre matlagningstillfällen och mindre dubbelköp. Ändrad portionsmängd uppdaterar båda dagarnas relation korrekt. | M/L · befintlig restidé, konkretiserad. |
| 5 | **Återanvänd en bra vecka** | Spara en namngiven mall, exempelvis ”Snabb vardagsvecka”, och förhandsgranska inför applicering på nya datum. | Återanvändning blir snabbare än ny slumpning. Egna dagar och befintlig plan bevaras tills ändringarna bekräftas. | M · tidigare konkurrensidé, naturlig vidareutveckling. |
| 6 | **Snabbare återbesök till Inköp** | Visa senast hämtad lista direkt, uppdatera i bakgrunden och ändra bara berörda rader. | Ingen helfliksspinner vid varje besök. Mät återbesök i befintlig harness och på telefon. | S/M · befintlig prestanda Batch C. |
| 7 | **”Använd det vi har” utan lagerbokföring** | Välj 2–4 råvaror som behöver användas; visa recept med träffar och vad som saknas. | Hjälper en konkret kväll utan att kräva att familjen inventerar hela kylen. Deterministisk matchning räcker. | M · tidigare gap G8, förenklad första version. |
| 8 | **Import med kvalitetskontroll** | Visa källa, protein, portioner och säsong före sparning; varna för saknad mängd och möjlig dublett. Behåll utkast vid misstag. | Färre importer behöver efterarbete och färre fel når matlagningen. | M · R11–R12 samt tidigare provenance-idéer. |
| 9 | **Handla i butikens ordning + återkommande varor** | Sparad kategoriordning per hushåll/butik och snabbknappar för exempelvis mjölk, bröd och blöjor. | Färre turer mellan butiksgångar och mindre fritextskrivande. Delas mellan familjens telefoner. | S/M · befintligt M1-gap + förenklad staples-funktion. |
| 10 | **Begriplig ändringshistorik och säker Ångra** | Senaste ändringarna: ”Tisdagens middag flyttades till torsdag”; versionsbunden ångra för planoperationer. | Förklarar vad som hänt mellan enheter och kan återställa misstag utan att skriva över en partners senare arbete. | M/L · ny sammanhållen funktion; kräver R02/R07. |
| 11 | **Planera efter tid och praktiska villkor** | Markera en dag ”max 20 min” eller ”ingen ugn”; förslagen respekterar villkoret. | Mindre behov att byta rätter på stressiga dagar. Manuell generering behålls. | M · ny konkret avgränsning; kalenderintegration behövs inte först. |
| 12 | **Enkel start för ett nytt hushåll** | Hushållsinbjudan, enkel inloggning, portioner, matpreferenser och en guidad första plan/lista. | En vänfamilj ska kunna komma igång utan databasdashboard eller hjälp av utvecklaren. | L · redan M1; R09 och tillförlitlighetsarbetet är förutsättningar. |

### Viktiga avgränsningar för dessa förslag

- **Säker sparning först, full offlinefunktion senare.** Börja med korrekta kvittenser och kvarhållet osparat utkast. En beständig lokal offlinekö kräver ett uttryckligt designbeslut mot projektets nuvarande regel om delat innehåll; Supabase ska fortsatt vara sanningskälla.
- **Receptstrukturen är skyddad av projektreglerna.** Käll-URL, relationsfält för rester eller nya betyg kan kräva schema-/mapperändringar. De är förslag här, inte genomförda ändringar.
- **Säsong och protein är inte allergisäkerhet.** Om allergi-/uteslutningsfilter införs inför externa hushåll behöver okända ingredienser och importkvalitet hanteras uttryckligt; dagens proteinheuristik får inte användas som säkerhetsgaranti.
- **Besparingar bör beskrivas som beräknade.** Veckoheron visar ”sparat” baserat på summerad `saving` redan för ett förslag ([plan-viewer-deluxe.js](../../js/weekly-plan/plan-viewer-deluxe.js), rad 404–441). Visa hellre beräknad besparing, butik och prisernas datum. Verkligt sparat kräver belägg från inköp; pris per portion kräver bättre kostnadstäckning än enbart reor.
- **Ändringshistorik och Ångra löser olika behov.** Loggen förklarar; transaktioner/versioner förhindrar dataförlust. Den ena ersätter inte den andra.

### Vad jag skulle skjuta upp

Full familjekalender/Outlook-integration tills de befintliga delade flödena är stabila och kalenderbehovet fortfarande är prioriterat. Detsamma gäller App Store, ny AI i genereringen och breda funktioner för näring eller automatisk kylskåpsinventering. Det finns mer omedelbar familjenytta i tabellen ovan. För kommersiell riktning: validera först med ett litet antal externa hushåll efter korrekt isolering; den här granskningen har inte uppdaterat gamla marknadspriser, juridiska bedömningar eller intäktskalkyler.

## 4. UX och prestanda: vad granskningen faktiskt visar

Startvyn har en tydlig huvuduppgift: kvällens middag och ”Börja laga”. De fem flikarna ger en begriplig struktur och ljust/mörkt tema hänger ihop i de granskade skärmbilderna. Behåll detta och förbättra stegvis.

Tre möjligheter syns i vyerna:

1. **Receptvyn har många flytande verktyg** — sök, sortera, filter och plus — som konkurrerar med kortens innehåll. Prova en synlig sökrad med filter bredvid och en tydlig importknapp innan fler knappar tillkommer. Testa att viktiga kontroller inte skymmer kortåtgärder på liten skärm.
2. **Matsedeln lägger mycket yta på veckosammanfattning och passerade dagar.** På lördagen i testvyn hamnade kvällens kort långt ned. Pröva ”Till idag” eller kompakt hopfällning av passerade dagar, med bibehållen enkel åtkomst till hela veckan. Detta är en användbarhetshypotes, inte ett visat kodfel.
3. **Ikonerna behöver begriplighet även utan färg.** Inköpsstatus och hushållsändringar bör få text där betydelsen annars måste läras in. Det mörka lägets dämpade kontroller bör kontrastmätas i en separat tillgänglighetsrunda; inga exakta kontrastkvoter har mätts här.

Syntetiska resultat från denna körning:

| Mätpunkt | Observation | Tolkning |
|---|---|---|
| Kallstart | 32 sidrequests, 11 registrerade stub-frågor; Idag-markering cirka 595 ms. | Visar beroendekedjan i testmiljön, inte produktionslatens. |
| Inköp, första besök | Cirka 386 ms till synligt, 4 frågor. | Fliken väntar på omladdning. |
| Inköp, andra besök | Cirka 375 ms till synligt, återigen 4 frågor. | Stark kandidat för visa-cache-först i minnet. |
| Andra rundan genom flikarna | 7 nya databasfrågor. | Återbesök kan göras lättare. Noll frågor är inte ett absolut mål om färsk data behövs. |
| DOM vid start | Cirka 4 382 noder, varav 3 405 i den initialt dolda receptvyn. | Ladda/rendera receptvyn senare om det förenklar uppstart; inget belägg här för ramverksbyte. |

Service workers var blockerade. Harnessens generiska rubrik om ”varmstart med service worker” gäller därför **inte** denna anpassade körning. Omladdningssiffrorna får inte tolkas som bevis för cachebeteendet.

## 5. Utveckling, testbarhet och drift

### T01 · Reproducerbara installationer och bredare CI-kontroll

[package.json](../../package.json) har versionsintervall, [.gitignore](../../.gitignore) ignorerar lockfilen och [test.yml](../../.github/workflows/test.yml), rad 24–38, kör `npm install` och syntaxkontrollerar endast `js/app.js`. En ren installation kan alltså få ändrade beroenden utan kodändring. `node --check` följer inte importer. Frontend laddar dessutom Supabase med flytande `@2` från CDN i [supabase-client.js](../../js/supabase-client.js), rad 5.

**Förslag:** spårad lockfil, `npm ci`, vald Node-version och syntaxkontroll av alla moduler. Pinna/bundla frontendberoendet. Lägg befintlig webbläsarharness i en reproducerbar testinstallation. Nuvarande lyckade lokala tester kördes på Node 24.14.0 med Supabase 2.106.1 och jose 6.2.12; CI använder Node 20, vilket inte kördes separat här.

### T02 · Databasens grundschema saknas i migrationsserien

Migration 001 förutsätter bland annat `weekly_plans`; 002 refererar `households`. Serien 001–011 skapar inte alla kärntabellerna från tom databas. En designspecifikation finns, men den är inte en verifierad körbar baseline.

**Förslag:** ta fram en schema-baseline från verifierat aktuellt schema, inklusive RLS, index, grants, triggers och RPC:er, och prova återskapning i en tom separat databas. Dokumentera faktisk migrationsstatus och en återställningsövning. Att köra befintliga migrationer på produktion är inte en lämplig metod att undersöka detta. Ingen live-backup eller återställningsförmåga har kontrollerats här.

### T03 · En aktuell statuskälla och testfall för förlorad data

[docs/status.md](../status.md) säger både att migrationer körts och innehåller äldre instruktioner att köra dem. Digestens ”Inga öppna obeslutade” på rad 44 motsägs av den dokumenterade dispatch-luckan på rad 65. Äldre beskrivningar av arkivering finns kvar trots att nya dagar numera lösgörs. Det ökar risken att nästa agent gör fel eller upprepar gammalt arbete.

**Förslag:** håll digest och aktiv kö korta, arkivera inaktuella instruktioner och ge varje fynd ett stabilt id, status, verifieringsbevis och kriterium för stängning. Sammanför denna rapport med befintlig backlog när åtgärdsarbetet beställs; skapa inte en tredje konkurrerande ”sanning”. Din tidigare lokala verifieringsanteckning i status.md har bevarats.

Testinvesteringen bör riktas mot kontrakt som familjen märker: misslyckad skrivning, retry, dubbla anrop och två samtidiga användare. De gröna enhetstesterna är värdefulla men dagens svit provar främst normala flöden och vissa isolerade fel. Testnamnet ”atomär” visar inte att hela klient-/server-/databaskedjan är atomär.

## 6. Föreslagen genomförandeordning

| Etapp | Omfattning | Klart när |
|---|---|---|
| A · Akuta, avgränsade korrigeringar | R01, R04, R05, R10; därefter R11–R13. | Inga oskyddade dispatch-anrop, ingen falsk sparstatus, inga tappade felresultat och exakta mängder vid faktor 1. Regressionsfall verifierade. |
| B · Gemensam dataintegritet | R02, R03, R06, R07, R08 och databasbaseline. | Fel i varje skrivsteg lämnar begripligt tillstånd; två samtidiga operationer serialiseras eller ger hanterbar konflikt; listan täcker exakt valda dagar. |
| C · Daglig användbarhet | Produktförslag 1–2 och 6 samt R14. | Sparstatus begriplig, inga onödiga helfliksspinnrar och korrekt bounded offline-fallback testad separat. |
| D · Första nya familjevärdet | Favoriter och en enkel veckomall; sedan restkopplingar. | Familjen kan återanvända något den gillat och behöver färre manuella byten. |
| E · Externa hushåll, om prioriterat | R09, onboarding och nödvändiga import-/preferensregler. | Två hushåll kan inte se eller mutera varandra; en ny familj klarar första veckan utan administratörshjälp. |

Etapp A och B har högre prioritet än nya funktioner. R09 flyttas fram om ett andra hushåll ska användas redan nu. Börja inte med en total omskrivning eller en stor komponentabstraktion; projektets rena urvals- och ingrediensfunktioner går att behålla.

## 7. Verifieringsprotokoll för reproducerade fynd

Reproduktionerna körde aktuell kod i minnet. Produktionsfiler modifierades inte för att framkalla resultatet.

| Fynd | Testupplägg | Observerat |
|---|---|---|
| R02 | Riktiga `savePlanToSupabase` + `activatePlanAtomic`; `makeMockDb` extraherad ur plan-orchestration-testet; samma datum på gammal/ny plan och `rpcMode: crash`. | Gammal plan aktiv med 0 dagar; ny inaktiv plan ägde båda datum. |
| R03 | Riktig `markRoundShopped`; testsvitens mock, injicerat `shopping_items`-läsfel efter lyckad stämpling. | Stämpel kvar, vara fortfarande recipe; retry konverterade 0. |
| R04 | Exakt `flSaveNote` och statusfunktion extraherade ur källfil; mockat DOM och db. | Första anropet fel; andra anropet visade Sparad utan nytt DB-anrop. |
| R05 | Exakt `flushPendingChecks`; två uppfyllda Supabase-liknande felresultat. | Kö tömd, inga toasts, inget retry-anrop. Reject-kontrollen återlade däremot poster. |
| R10 | Faktiska parse-/format-/renderfunktioner samt `openCookMode` med lika grund- och målportioner. | 0,1 kg → 0,25 kg vid faktor 1; Unicode-bråk skalades inte. |
| R11 | Faktisk `guessProtein`-funktion med engelskt chicken-recept. | Resultat vegetarisk. |

Särskilt återstående verifiering inför korrigeringar: verklig DB-transaktion/rollback och RLS i separat testmiljö, två klienters samtidiga ändringar, Safari/PWA-livscykel, faktiska typsnitt, skärmläsare, service worker vid 5xx/offline och koppling mot butik utan att fylla familjens riktiga korg under test.

## 8. Leverans och ändringar under granskningen

Rapport, lokala webbläsarresultat och skärmbilder är skapade. Det saknade deklarerade paketet jose installerades lokalt så att testerna kunde köras. Appkod, databas och deployment har inte ändrats; inga commits eller pushar gjordes. Den tidigare lokala ändringen i `docs/status.md` är kvar. Alla föreslagna korrigeringar och funktioner i rapporten är ännu förslag.
