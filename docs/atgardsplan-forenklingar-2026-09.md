# Åtgärdsplan — förenklingarna F01–F07

Svar på `docs/review-2026-09-12/forenklingsrapport.md` (Astra/Codex, GPT-5.6 Sol, 2026-09-12).
Joakims besked: *"Spara rapporten - allt låter som åtgärder jag vill lösa"* — alla sju är önskade.
Planen nedan är skriven mot **aktuell kod** (`631c43b`, dvs. efter Session 144:s tio R-fixar);
förenklingsrapporten skrevs mot `31a8b8c`, så varje punkt är omverifierad först.

Webböversikten finns i `roadmap.html` (sektionen *Förenklingar F01–F07*). Statusflaggor och
öppna beslut bokförs i `docs/status.md` — den här filen är genomförandeplanen och ändras
bara om planen görs om.

---

## Verifiering mot aktuell kod (2026-09-12, efter Session 144)

| Punkt | Gäller fortfarande? | Belägg i koden |
|---|---|---|
| F01 dagens ursprung styr åtgärderna | **Ja** | `plan-viewer-deluxe.js` `sheetMenuHtml`: egen receptdag får *Redigera dagen*, aktiv plandag får *Byt recept* (bara `planId === 'active' && !isPast`), *Ta bort från inköpslistan* finns bara för egna dagar |
| F02 bekräftelsens betydelse oklar | **Ja** | `api/confirm.js` sätter bara `confirmed_at`; flaggan läses fortfarande i 8 filer (day-sheetens listrad, prisoptimera, generatorns varning, `discard-plan` m.fl.). R06-fixen tog bort den ur list-ombyggnaden — resten av kvarlevan står kvar |
| F03 "Vi äter ute" skjuter schemat | **Ja** | `api/day.js` action `push` är enda vägen — noteringen skrivs och allt efter skjuts ett steg, utan val för användaren |
| F04 inköpsstatusarnas mekanik | **Ja** | `markRoundShopped` konverterar fortfarande obockade receptvaror till `source='manual'` (nu i säker ordning efter R03/R08 — men UX-modellen är oförändrad: varan dyker upp som "eget tillägg" ingen lagt till) |
| F05 bekräftelsedialog för handla-läge | **Ja** | `shopping-list.js` `handlaModeFabClick`: `confirmDialog` vid varje start |
| F06 lager av funktionsersättningar | **Ja** | `wrap()` i `today-view.js` + egna `switchTab`-omslag i både `plan-viewer.js` och `plan-viewer-deluxe.js` — tre lager, laddningsordningen avgör vilket som ligger ytterst |
| F07 preferenser via GitHub | **Ja** | `api/shopping.js` `get/set_preferences` → `dispatch-preferences.json` via `GITHUB_PAT`. Enda kvarvarande aktiva GitHub-JSON-filen (CLAUDE.md) |

Inget av Session 144-arbetet har löst någon F-punkt — men R03/R06/R08 har gjort **grunden säkrare**
att bygga F-arbetet på (idempotent inköpsavslut, täckningsstyrd ombyggnad).

---

## Genomförandeordning

Astras föreslagna ordning behålls i sak; här är den omsatt i projektets termer med
storlek, mutationsklass och beslutspunkter. R-arbetet (etapp A–E i `roadmap.html`)
löper parallellt och trängs inte undan.

### F-etapp 1 — byggs direkt: F05 *(S · render-only · inget beslut behövs)*

Ta bort startbekräftelsen i `handlaModeFabClick` — kundvagns-FAB:en växlar läget med ett
tryck åt båda hållen. Läget förblir en vy-preferens i minnet (nollställs vid omladdning),
helt enligt regeln att rena vy-preferenser inte är delat innehåll. Ingen dataväg rörs:
bockar, dagtäckning och inhandlat-status är opåverkade.

**Klart när:** ett tryck startar, ett tryck stänger, ingen dialog; bock-status och
täckning identiska före/efter; fokus/scroll överlever radflytt (Astras kriterium).

### F-etapp 2 — beslutspaketet *(Joakim — fem frågor, se sist i filen)*

F01 och F02 avgör vad "en middag" och "ett förslag" betyder. Det är modellbeslut,
inte implementation — Astra har rätt i att de ska tas tillsammans och före kodning.
Claudes rekommendation per fråga står i beslutslistan.

### F-etapp 3 — förslagsmodellen: F02 → F01 *(L · datamuterande · migration krävs)*

**F02 först** — den löser R02-klassen strukturellt i stället för med fler fallbacks:

1. **Generering skriver inte längre skarpt.** I dag: upsert av dagar (stjäl datum från
   aktiva planen) → detach → aktivera — R02 var symptomet. I stället sparas förslaget
   *vid sidan av* den levande planeringen (rekommendation: JSON-kolumn `proposal` på
   `weekly_plans`-raden, `is_active=false`; en ny tabell är alternativet). Förslaget syns
   på båda telefonerna (delad data-regeln) men rör inga `meal_days`-rader.
2. **"Använd förslaget"** (ersätter "Bekräfta matsedeln") visar vilka datum som ändras
   och applicerar sedan allt i **en** RPC: skriv dagarna, bevara egna dagar (invariant #1),
   aktivera. Fel = ingenting ändrat. Avvisat förslag = befintlig planering orörd.
3. `confirmed_at`-konsumenterna städas: flaggan ersätts av "planen är applicerad" —
   snabbåtgärder, prisoptimera och genereringsvarningen läser det i stället.
   Val av inköpsdagar förblir ett eget steg (Session 134-modellen, orörd).

**F01 därefter, i två steg:**

- **Steg 1 (M · render-only + befintliga endpoints):** enhetliga dag-sheet-åtgärder.
  *Byt recept* för alla receptdagar oavsett ursprung (R06:s täckningsstyrda ombyggnad
  gör det säkert), *Ta bort från inköpslistan* även för plandagar, *Redigera dagen*
  överallt. Ursprunget slutar synas i menyn.
- **Steg 2 (L · datamuterande):** generering fyller valda datum; plantillhörighet blir
  metadata (gruppering/historik), inte behörighet. Kartlägg alla `plan_id`-beroenden
  (generate, day-ops, dagväljaren, arkivet, tidslinjen) **innan** något fält tas bort —
  Astras uttryckliga varning. Detta steg kan visa sig onödigt stort; utvärdera efter
  F02 + F01 steg 1 om kvarvarande friktion motiverar det.

**Testkrav (invariant #5):** hela sviten + nya fall för överlapp, fel i varje RPC-steg,
två samtidiga genereringar, egna dagar mitt i förslagsspannet. Mobilverifiering av
Session 144-fixarna bör vara klar **innan** etappen börjar — stora ombyggen ovanpå
o-verifierade fixar staplar risk.

### F-etapp 4 — flöden ovanpå modellen: F03 + F04 *(M · datamuterande)*

**F03:** "Ingen middag"-sheeten får tre uttryckliga val i stället för ett dolt beteende:

- *Skjut fram schemat* (dagens `push`) — med omfattningen synlig före: "3 middagar flyttas en dag".
- *Flytta middagen till en annan dag* — återanvänder flytta-läget/`swap` mot tom dag.
- *Ta bort middagen* — `delete`, med Ångra.

Allt via `api/day.js` — inga nya endpoints, ingen parallell flyttmotor. **"Spara till
senare" byggs inte** (rekommendation): det vore ett nytt dolt tillstånd, och "flytta till
valt datum" täcker behovet. R07 (dubblettskydd i `day.js`) bakas in här — samma kod ändå.

**F04, två steg:**

- **Steg 1 (S · datamuterande, liten kolumn):** konverterade varor märks vid "Vi har
  handlat" (nullable `carried_over_at` på `shopping_items`, idempotent migration) så
  UI:t kan skilja "kvar sedan förra rundan" från äkta egna tillägg. Utan märkningen går
  bara namnbyten att göra — vilket Astra uttryckligen avråder från.
- **Steg 2 (M · render-only):** listan grupperas efter hur familjen handlar: *Att köpa*
  (per kategori som i dag) · *Kvar sedan förra rundan* · *Har hemma* · *I korgen*
  (handla-läget). Receptkopplingen ligger bakom raden, täckningen visas som mening
  ("Listan gäller tis–tors"), ursprunget blir sekundärt.

**Klart när** (Astras kriterier): familjen kan förutse listans innehåll efter receptbyte,
ändrat dagurval och avslutad handling; manuella tillägg och obockade varor överlever
avsedd ombyggnad utan dubbelköp.

### F-etapp 5 — löpande respektive fristående: F06 + F07

**F06 (M · render-only per steg, stegvis):** inför en liten `notifyDataChanged(topic)`
i `js/utils.js`/`state.js` (vanliga funktionsanrop, prenumeration per vy — ingen
händelsebuss, inget ramverk). Ersätt sedan `wrap()`-kedjorna fil för fil **när
F-etapp 3 ändå rör filerna**: `today-view.js` → `plan-viewer-deluxe.js` → `plan-viewer.js`.
Ingen separat stor omskrivning — Astras linje. Klart när Idag och Matsedel uppdateras
efter API-svar, omladdning och fjärrändring utan att ersätta varandras funktioner.

**F07 (M · datamuterande · migration krävs):** ny tabell `dispatch_preferences`
(RLS-household-mallen från `002_pantry_items.sql`), engångsmigrering av värdena i
`dispatch-preferences.json`, byt läs-/skrivvägen i `api/shopping.js` + verifiera att
dispatchen läser samma källa. **Bunta med backlog #5** (Willys-cookies gist → Supabase)
till ett migrationspaket inför M1 — samma mönster, samma verifiering, en OK-runda.
Därefter avvecklas `api/_shared/github.js` + `GITHUB_PAT` (sista konsumenten) och
`GITHUB_GIST_PAT`. Repo-JSON-filerna raderas inte utan separat OK (CLAUDE.md-regeln).

---

## Samspel med övrigt öppet arbete

- **R01 + R13-zoom** är oberoende av allt ovan — körs på Joakims OK när som helst
  (flaggorna `r01`/`zoom` i workflowskriptet). R01 bör inte vänta på F-arbetet.
- **R07** löses i F-etapp 4 (F03 rör samma kod i `day.js`).
- **R09/M1**: F07 är i praktiken en förutsättning (preferenser per hushåll), och
  F-etapp 3:s modell gör tenancy-arbetet enklare. E-etappen ligger kvar efter F-etapp 3–4.
- **Produktetapp D** (veckomall, favoriter) bör vänta på F-etapp 3 — en veckomall byggd
  på dagens plan/bekräfta-modell skulle byggas om direkt efteråt.
- **Öppna utredningen "flera levande matsedlar"** (status.md, Session 134) *löses* av
  F01 steg 2: när datumets middag är grundmodellen finns ingen "gammal plan" att låsa.

## Beslut som behövs innan bygget (F-etapp 2)

1. **F02-lagring:** förslag som JSON-kolumn på `weekly_plans` + apply-RPC
   *(rekommenderas — minst yta, atomär per konstruktion)*, eller egen tabell?
   Kräver migration → ditt OK enligt migrationsregeln.
2. **F02-språk:** får "Använd förslaget" ersätta "Bekräfta matsedeln" i UI:t?
3. **F03:** bekräfta att *"Spara till senare" inte byggs* — "flytta till valt datum" täcker det.
4. **F04:** OK till kolumnen `carried_over_at` på `shopping_items` (liten idempotent migration)?
5. **F07:** OK att bunta med backlog #5 i ett migrationspaket, och att `GITHUB_PAT`-vägen
   avvecklas när preferenserna flyttat?

F-etapp 1 (F05) kräver inget beslut och byggs på nästa "kör".
