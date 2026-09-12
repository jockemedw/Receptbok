# Förenklingar av Receptboken – önskade åtgärder

Komplement till [projektgranskningen](rapport.md). Bedömningen gäller appkoden i `31a8b8c`; rapportpaketet publicerades därefter i dokumentationscommit `2dcc0f8`.

## Beslut och status

Joakims besked, ordagrant:

> Spara rapporten - allt låter som åtgärder jag vill lösa

**Samtliga sju förbättringsområden nedan är önskade åtgärder. Ingen är genomförd i denna rapport.** Beskedet bekräftar inriktningen; de tekniska genomförandeförslagen och kvarvarande alternativ ska fortfarande bedömas mot aktuell kod och projektets regler. Det är inte ett beslut att köra en viss migration eller att välja varje föreslagen detaljlösning.

Detta dokument sparar bedömningen av onödig komplexitet och otydliga produktregler. Felkatalogen R01–R14 i huvudrapporten gäller parallellt. Åtgärderna här ersätter inte akuta säkerhets- eller dataförlustkorrigeringar.

## Huvudbedömning

Appen har blivit en flexibel familjeplanerare men behåller flera regler från en äldre veckogenerator. Skillnader mellan aktiv plan, egna dagar och bekräftade förslag läcker ut i användarflödet. Senare funktioner har delvis lagts ovanpå tidigare funktioner, vilket skapar fler specialfall än familjens behov motiverar.

Målet är att göra appen lättare att förstå och förvalta. Behåll den deterministiska receptväljaren, gemensam hushållsdata, manuell generering och Idag-vyn som grund. Ett ramverksbyte eller en total omskrivning följer inte av denna bedömning.

## F01 · Samma middag ska fungera likadant oavsett ursprung

**Nu:** en middag från aktiv plan och en egen middag på ett datum kan få olika redigeringsalternativ. När en äldre plans dagar lösgörs blir de egna dagar, trots att familjens avsikt inte förändrats.

**Bedömning:** ursprunget får för stor betydelse för vad användaren kan göra. Familjen tänker ”torsdagens middag”, inte ”en rad som tillhör den senaste aktiva genereringen”.

**Önskat resultat:** datumets middag är den gemensamma grundmodellen. Generering fyller valda datum. Ursprunget får sparas som metadata men ska normalt inte styra redigeringsmöjligheterna.

**Förslag till genomförande:** börja med en gemensam modell för läsning och åtgärder i klient/server. Utred därefter vilka planfält som fortfarande behövs för förslag, historik och gruppering. Ta inte bort tabeller eller relationer innan beroenden och befintliga data är kartlagda.

**Klart när:** samma recept på samma datum erbjuder samma relevanta åtgärder oavsett om det skapades manuellt, genererades eller överlevde en tidigare plan. Generering, flytt och redigering bevarar andra datum, noteringar och inköpskopplingar. Kontrollera överlapp och samtidiga ändringar, inte bara normalfallet.

Underlag: [plan-viewer.js](../../js/weekly-plan/plan-viewer.js), rad 221–277; [plan-viewer-deluxe.js](../../js/weekly-plan/plan-viewer-deluxe.js), rad 1303–1342. Koppling till R02, R06, R07 och R09.

## F02 · Ge bekräftelsen en tydlig betydelse

**Nu:** ”Bekräfta matsedeln” bygger inte längre inköpslistan. Det markerar planen som bekräftad, påverkar snabbåtgärder och varningar, men middagarna kan fortfarande ändras.

**Bedömning:** det är oklart vad familjen accepterar och varför steget behövs. Bekräftelsen har kvar följder från ett äldre arbetsflöde.

**Önskat resultat:** ett begripligt och konsekvent förhållande mellan förslag och sparad planering.

**Rekommenderad riktning:** en riktig förhandsgranskning. ”Använd förslaget” visar och applicerar vilka datum som ändras, medan befintlig planering är kvar tills förslaget används. Dagens upplägg med tidiga skrivningar följda av separat bekräftelse bör inte bara döpas om.

**Alternativ:** direkt sparning med säker Ångra kan fungera för små ändringar. Rapporten rekommenderar förhandsgranskning när flera befintliga middagar påverkas; exakt användarflöde är ännu inte fastställt.

**Klart när:** användaren kan förklara vad bekräftelsen gör; ett avvisat förslag lämnar befintlig planering orörd; ett fel vid applicering lämnar inte en halv plan. Val av inköpsdagar är fortsatt ett eget, tydligt steg.

Underlag: [confirm.js](../../api/confirm.js), rad 4–10; [discard-plan.js](../../api/discard-plan.js); [plan-generator.js](../../js/weekly-plan/plan-generator.js). Koppling till F01 och R02.

## F03 · Skilj ”Vi äter ute” från att skjuta fram schemat

**Nu:** ”Ingen middag den här dagen”, inklusive ”Vi äter ute” och ”Rester”, skjuter undan middagen och kan förskjuta följande middagar.

**Bedömning:** avsikten att inte tappa rätter är rimlig. Men att ange en kvällsaktivitet innebär inte självklart att resten av schemat ska flyttas.

**Önskat resultat:** familjen styr vad som händer med den undanträngda middagen. Förskjutning av flera dagar är ett uttryckligt valt beteende.

**Förslag:** erbjud relevanta val för middagen: flytta till ett valt datum, spara till senare eller ta bort från planeringen. ”Spara till senare” behöver en bestämd betydelse och får inte bli ännu ett dolt tillstånd. Återanvänd den gemensamma dagoperationsvägen; skapa inte parallella flyttmotorer.

**Klart när:** ”Vi äter ute” inte oväntat flyttar andra bokade middagar. Om flera dagar ska flyttas visas omfattningen före ändringen. En undanträngd middag försvinner inte utan ett tydligt val, och Ångra respekterar en partners senare ändringar.

Underlag: [plan-viewer-deluxe.js](../../js/weekly-plan/plan-viewer-deluxe.js), rad 1317–1323 och 1366–1377; [day.js](../../api/day.js), rad 11–35. Koppling till F01, F02 och R07.

## F04 · Låt inköpslistan följa hur familjen handlar

**Nu:** användaren möter bockad vara, ”har hemma”, inhandlad middag, inköpsrunda och egna tillägg. En obockad receptvara kan dessutom omvandlas till ett eget tillägg utan att användaren själv har lagt till den.

**Bedömning:** interna regler om ursprung och livslängd får för stor plats i gränssnittet. Familjen måste lära sig mekaniken för att förstå vad nästa lista innehåller.

**Önskat resultat:** tydlig skillnad mellan vad som behövs, vad som finns hemma och vad som köpts. Varans ursprung är sekundär information. Kvarvarande varor ska beskrivas som exempelvis ”Kvar att köpa”, inte få ett missvisande ursprung.

**Förslag:** kategorisera inköpsvaror efter hur de handlas, med receptkoppling bakom respektive rad. Visa vilka middagar listan täcker. Behåll nödvändig information om köpta ingredienser och kvarvarande behov; enbart namnbyten på dagens statusar räcker inte.

**Klart när:** familjen kan förutse listans innehåll efter ett receptbyte, ett ändrat dagurval och avslutad handling. Manuella tillägg och obockade varor överlever avsedd ombyggnad utan dubbelköp. Samma råvara från flera recept hanteras begripligt.

Underlag: [shopping-list.js](../../js/shopping/shopping-list.js), bland annat rad 758–884 och 909–925; [shopping-store.js](../../api/_shared/shopping-store.js), rad 111–168 och 344–389. Koppling till R03, R05, R06 och R08.

## F05 · Gör handla-läget till ett enkelt visningsval

**Nu:** det krävs en bekräftelsedialog för att starta läget där bockade varor flyttas under ”I korgen”.

**Bedömning:** en liten reversibel sorteringsförändring har blivit ett separat arbetsflöde. Familjen behöver inte godkänna samma förklaring vid varje start.

**Önskat resultat:** ett direkt val mellan att låta bockade varor behålla platsen eller visas längst ned. Läget ska vara lätt att förstå och ändra.

**Förslag:** en enkel visningsinställning eller tydlig växel utan återkommande bekräftelse. Håll isär den från ”Vi har handlat”, som faktiskt ändrar inköpsrundans data. Om inställningen ska kommas ihåg, bestäm om den gäller enheten eller hushållet enligt projektets regler.

**Klart när:** sorteringen ändras med ett tryck och kan återställas direkt utan att bockstatus, dagtäckning eller inhandlatstatus påverkas. Fokus och scroll förblir användbara när en rad flyttas.

Underlag: [shopping-list.js](../../js/shopping/shopping-list.js), rad 1295–1306. Detta är en avgränsad förbättring som kan göras separat från F04.

## F06 · Ersätt lager av funktionsersättningar med tydlig uppdatering

**Nu:** Idag-vyn och veckovyn ersätter och omsluter globala funktioner för laddning, rendering och navigation. Importordningen styr vilket lager som ligger ytterst. Flera ingångar omsluts eftersom andra anrop går direkt till lokala funktioner.

**Bedömning:** lösningen är begriplig som stegvis utbyggnad men svår som permanent struktur. För att förstå en uppdatering måste man följa flera filer och deras laddningsordning.

**Önskat resultat:** en tydlig väg som uppdaterar relevant data och meddelar berörda vyer. Det ska gå att följa beteendet utan att rekonstruera en kedja av överskrivna funktioner.

**Förslag:** samla ägarskapet för datauppdateringen och använd explicita modulgränser. Börja med vanliga funktionsanrop eller en liten gemensam notifiering där behovet finns. Inför inte automatiskt ett ramverk, en generell händelsebuss eller ett nytt stort state-system.

**Klart när:** Idag och Matsedel uppdateras korrekt efter API-svar, omladdning och fjärrändring utan att de ersätter varandras laddnings-/navigeringsfunktioner. Inmatad text, fokus, scroll och vald vecka bevaras enligt avsedd interaktion. Diagnostik får inte ändra produktbeteendet.

Underlag: [plan-viewer-deluxe.js](../../js/weekly-plan/plan-viewer-deluxe.js), rad 1650–1698; [today-view.js](../../js/today/today-view.js), rad 414–454. Hela `window`-ytan behöver inte skrivas om i samma steg.

## F07 · Samla inköpspreferenser med övrig hushållsdata

**Nu:** exempelvis varumärkespreferenser läses och skrivs i `dispatch-preferences.json` via GitHub, medan nästan all annan hushållsdata ligger i Supabase.

**Bedömning:** en vanlig appinställning behöver en separat lagringsväg, GitHub-behörighet och filversionshantering. Det finns ingen tydlig produktnytta med denna kvarvarande skillnad.

**Önskat resultat:** preferenser lagras och behörighetskontrolleras per hushåll i samma databas som övriga inställningar.

**Förslag:** migrera befintliga värden, byt läs-/skrivvägen och verifiera att både gränssnitt och dispatch använder samma källa. Avveckla därefter enbart GitHub-kod och behörigheter som verkligen saknar andra konsumenter. Repo-filer och hemligheter får inte raderas på antagande.

**Klart när:** befintliga inställningar är bevarade, ändringar syns på båda telefonerna och rätt hushålls värden används i dispatch. Lagringen av preferenser kräver inte en GitHub-commit. Databasändringen följer projektets migrationsregler.

Underlag: [shopping.js](../../api/shopping.js), rad 22–37; [github.js](../../api/_shared/github.js). Koppling till R09 inför fler hushåll.

## Föreslagen arbetsordning

1. **Hantera akuta fynd i huvudrapporten parallellt.** Rapportens förenklingsarbete ska inte försena skydd mot obehörig dispatch, falsk sparstatus eller felaktiga mängder.
2. **Bestäm F01 och F02 tillsammans.** De avgör vad en middag respektive ett förslag betyder och hur befintlig planering bevaras.
3. **Genomför F03 och F04 utifrån den modellen.** De behöver gemensamma regler för flytt, kvarvarande middagar och inköpskopplingar.
4. **F05 kan göras som ett litet fristående steg.** Det ska bara ändra presentationen.
5. **Gör F06 stegvis i berörda flöden.** Undvik en stor separat omskrivning som försenar användarnyttan.
6. **F07 kan genomföras separat** när hushållsbehörighet och migrationsväg är klara.

## Till nästa genomförare

Läs också [överlämningen till Claude](LAS-MIG-CLAUDE.md) och huvudrapportens verifieringsbegränsningar. Bekräfta vilka delar som fortfarande gäller i aktuell kod innan arbetet börjar. Beskriv varje ändring som presentation eller datamutation och följ projektets verifieringskrav.

Det finns inga beräknade löften om radbesparing eller kostnad i denna bedömning. Framgång mäts i färre specialfall, tydligare handlingar och bevarad familjedata. De sju punkterna är önskade åtgärder; inga appändringar, migrationer eller deployer har gjorts när rapporten sparas.
