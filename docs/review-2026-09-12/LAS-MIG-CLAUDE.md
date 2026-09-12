# Till Claude: granska Codex rapport om Receptboken

## Uppdrag och läsordning

Joakims instruktion: "Spara en tydlig rapport för Claude att granska".

Granska slutsatserna självständigt. Den här överlämningen beställer en granskning av rapporten, inte implementation, migrationer, push eller deploy. Behandla föreslagna lösningar och prioriteringar som förslag som kan behöva korrigeras.

1. Läs projektets aktuella `CLAUDE.md`.
2. Läs [huvudrapporten](rapport.md). Där finns 14 fyndgrupper (R01–R14), tre utvecklings-/driftförslag (T01–T03) och 12 produktförslag med rekommenderad ordning.
3. Kontrollera aktuell kod mot referenserna. Rapporten gäller commit `31a8b8cd1af7f4813aea1484d6209c1f5c9b9afe` på main, granskad 2026-09-12. Om HEAD skiljer sig: börja med diffen och kontrollera om fynd redan rättats.
4. Jämför med `docs/status.md`, `docs/qc-night/repo-audit-2026-07-12.md`, `docs/prestanda-plan-2026-09.md` och befintlig funktionsroadmap. Skilj nya fynd från redan kända och undvik dubbla backlogposter.

## Börja med dessa fynd

| ID | Påstående att kontrollera | Underlag från Codex |
|---|---|---|
| R01 | Vanlig GET/POST i butikskorgens endpoint saknar JWT-krav; GET kan lämna ut sparat kontonamn. | Kodspårning. Ingen skarp exploatering. GET-följden beror på att kontouppgifter finns sparade. |
| R02 | Upsert av överlappande plandagar före aktivering kan lämna den gamla aktiva planen utan dagar när RPC:n fallerar. | Riktiga exporter kördes mot befintlig testmock: aktiv gammal plan hade 0 dagar, ny inaktiv plan ägde båda datum. |
| R03 | Fel efter stämpling av ”Vi har handlat” kan inte repareras genom samma anrop igen. | In-memory-felinjektion: stämpel kvar, obockad vara fortfarande recipe; retry konverterade 0. |
| R04 | Anteckning kan visa Sparad efter en misslyckad sparning utan nytt databasanrop. | Exakt funktion extraherades till mockmiljö; andra försöket ändrade status men gjorde inget nytt anrop. |
| R05 | Inköpsbockar tappar skrivfel som returneras som uppfyllt `{error}`-resultat. | Exakt flush-funktion: kö tömd och ingen toast/retry. Promise-rejection-kontroll gav däremot återlagda poster. |
| R06 | Receptbyte styr ombyggnad efter bekräftelse i stället för faktisk listtäckning. | Kodspårning mot dagväljarens uttryckliga produktregel. Scenarier finns i rapporten; inte körda mot live. |
| R10 | Matlagningsläget rundar om mängder redan vid skalfaktor 1. | Faktiska formatteringsfunktioner och initialvägen genom openCookMode: 0,1 kg blev 0,25 kg. |

R07–R09 gäller samtidighet, inköpslistans aktivering och hushållsisolering. De är viktiga, men skilj visad skrivordning från härledda interleaving-scenarier. R11–R14 gäller import, tillgänglighet och service worker. Fulla fil-/radreferenser, känd/ny-status, konsekvenser och åtgärdsförslag står i huvudrapporten.

## Hur stark är verifieringen?

- Alla 14 befintliga Node-testfiler passerade. Alla JavaScript-filer i js/ och api/ syntaxkontrollerades.
- Körningen använde Node 24.14.0, Supabase 2.106.1 och jose 6.2.12. CI:s Node 20 kördes inte separat.
- Sex fynd har isolerade körbara observationer enligt rapportens verifieringsprotokoll. De extra felinjektionsskripten kördes i minnet och **sparades inte som fristående regressionstester**. För oberoende reproduktion behöver motsvarande harness byggas igen; rapporten beskriver funktioner, mock och förväntat resultat.
- Enhetstester och mockar bevisar inte databasens faktiska transaktioner, RLS eller index i produktion. SQL-/samtidighetsförslag behöver verifieras i separat testmiljö innan implementation godkänns som säker.
- Inga live-migrationer, riktiga varukorgsfyllningar eller produktionsändringar gjordes.

## Webbläsarunderlag och dess gränser

[browser-results.json](browser-results.json) innehåller mätresultaten. Tio PNG-filer i samma mapp visar fem flikar i ljust och mörkt läge. Codex granskade samtliga.

Miljön var Edge via Playwright, 390 × 844 CSS-pixlar, syntetisk Supabase-data med 120 ms latens och ersatta typsnitt. Externa anrop och service workers blockerades. Inga JavaScript-/konsolfel eller riktiga Supabase-anrop observerades.

**Använd inte siffrorna som iPhone-mätning eller bevis för produktionscache/offlinefunktion.** Harnessens generiska varmstartsrubrik antyder service worker, men den var blockerad i denna körning. Den verkliga typografin, Safari, mobilens suspendering och skarp tvåenhetssynk är inte verifierade.

## Produktbedömningen är lika viktig som buggarna

Joakims ursprungliga mål var framför allt förslag på förbättringar och nya funktioner. Bedöm därför även rapportens produktprioriteringar, inte bara felkatalogen.

Codex rekommenderar: säkra sparningar och samtidiga ändringar först; sedan tydliga inköpsstatusar, snabbare återbesök till Inköp, familjefavoriter, återanvändbara veckor och rest-/lunchlådeplanering. Flera idéer är vidareutveckling av befintlig roadmap, inte nya uppfinningar.

Utmana särskilt:

- Vilka tre förbättringar ger störst nytta för den egna familjen med minsta fungerande lösning?
- Är det befintliga kalender-/kommersialiseringsspåret fortfarande viktigare än denna ordning?
- Är någon föreslagen transaktion, logg eller offlinekö större än problemet kräver?
- Vilka förslag kräver beslut om receptschema, lokal lagring eller externa hushåll? De besluten är inte fattade genom rapporten.

## Önskat resultat från din granskning

Lämna en kort sammanfattning och en tabell med:

`ID | Bekräftat / delvis / avfärdat / redan åtgärdat | eget kod- eller testbevis | korrigerad prioritet | minsta lämpliga åtgärd`.

Ange uttryckligt om en observation bara bygger på källkod, har reproducerats med mock eller verifierats i en riktig separat databas. Prioritera därefter de tre viktigaste korrigeringarna och de tre mest värdefulla produktförbättringarna. Förklara avvikelser från Codex bedömning. Räkna inte ett gammalt fynd som nytt enbart för att implementationen flyttats.

## Arbetskopia och sparade filer

Rapportpaketet ligger i `docs/review-2026-09-12/` och publiceras i GitHub-repot på Joakims uppmaning. Uppdatera arbetskopian innan granskning. Rapportens kodunderlag är fortfarande commit ovan; dokumentationscommiten ändrar inte appkoden.

`docs/status.md` har en sedan tidigare lokal ändring om Joakims mobilverifiering från 2026-07-05. Den har bevarats och ingår inte i denna granskning. Skriv inte över den. Appkoden har inte ändrats av Codex granskningsrunda.
